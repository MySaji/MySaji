"use server"

import { z } from "zod"
import { isLiveOnline } from "@/lib/provider-presence"
import { auth } from "@/auth"
import { db } from "@/lib/db"

async function requireProvider(): Promise<{ userId: string; providerId: string } | null> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "provider") return null
  const profile = await db.providerProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { userId: session.user.id, providerId: profile.id }
}

const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const

export type DaySchedule = { start: string; end: string; enabled: boolean }
export type WeeklySchedule = Record<(typeof DAY_KEYS)[number], DaySchedule>

const DEFAULT_SCHEDULE: WeeklySchedule = Object.fromEntries(
  DAY_KEYS.map((day) => [day, day === "sunday" ? { start: "", end: "", enabled: false } : { start: "08:00", end: "18:00", enabled: true }])
) as WeeklySchedule

export type ProviderBlockedDate = { id: string; date: string; reason: string }
export type ProviderJobEvent = { date: string; title: string; time: string; type: "job" }

export type ProviderAvailabilityData = {
  weeklySchedule: WeeklySchedule
  maxJobsPerDay: number
  breakDuration: number
  autoAccept: boolean
  travelRadiusKm: number
  isOnVacation: boolean
  vacationNote: string | null
  blockedDates: ProviderBlockedDate[]
  jobEvents: ProviderJobEvent[]
}

export async function getProviderAvailability(): Promise<ProviderAvailabilityData | null> {
  const provider = await requireProvider()
  if (!provider) return null

  const [availability, blockedDates, jobs] = await Promise.all([
    db.providerAvailability.findUnique({ where: { providerId: provider.providerId } }),
    db.blockedDate.findMany({ where: { providerId: provider.providerId }, orderBy: { date: "asc" } }),
    db.job.findMany({
      where: { providerId: provider.providerId, status: { in: ["ACCEPTED", "IN_PROGRESS", "COMPLETED"] } },
      select: { title: true, scheduledDate: true },
      orderBy: { scheduledDate: "asc" },
    }),
  ])

  return {
    weeklySchedule: (availability?.weeklySchedule as WeeklySchedule | undefined) ?? DEFAULT_SCHEDULE,
    maxJobsPerDay: availability?.maxJobsPerDay ?? 5,
    breakDuration: availability?.breakDuration ?? 30,
    autoAccept: availability?.autoAccept ?? false,
    travelRadiusKm: availability?.travelRadiusKm ?? 10,
    isOnVacation: availability?.isOnVacation ?? false,
    vacationNote: availability?.vacationNote ?? null,
    blockedDates: blockedDates.map((b) => ({ id: b.id, date: b.date.toISOString().slice(0, 10), reason: b.reason ?? "Blocked" })),
    jobEvents: jobs.map((j) => ({
      date: j.scheduledDate.toISOString().slice(0, 10),
      title: j.title,
      time: j.scheduledDate.toISOString().slice(11, 16),
      type: "job",
    })),
  }
}

export type ProviderAvailabilityActionResult = { success: true } | { success: false; error: string }

const dayScheduleSchema = z.object({ start: z.string(), end: z.string(), enabled: z.boolean() })
const updateAvailabilitySchema = z.object({
  weeklySchedule: z.object(Object.fromEntries(DAY_KEYS.map((d) => [d, dayScheduleSchema])) as Record<(typeof DAY_KEYS)[number], typeof dayScheduleSchema>),
  maxJobsPerDay: z.number().int().min(1).max(50),
  breakDuration: z.number().int().min(0).max(240),
  autoAccept: z.boolean(),
  travelRadiusKm: z.number().int().min(1).max(200),
})

export async function updateProviderAvailability(input: unknown): Promise<ProviderAvailabilityActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = updateAvailabilitySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const data = parsed.data

  await db.providerAvailability.upsert({
    where: { providerId: provider.providerId },
    create: { providerId: provider.providerId, ...data },
    update: data,
  })

  return { success: true }
}

const vacationModeSchema = z.object({
  isOnVacation: z.boolean(),
  vacationNote: z.string().trim().max(200).optional(),
})

/** Real enforcement, not just a UI flag — createBooking() and
 * createEmergencyBooking() (lib/actions/jobs.ts) both check this same
 * ProviderAvailability.isOnVacation before letting a customer book, so
 * turning this on genuinely stops new work from reaching the provider. */
export async function setVacationMode(input: unknown): Promise<ProviderAvailabilityActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = vacationModeSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.providerAvailability.upsert({
    where: { providerId: provider.providerId },
    create: { providerId: provider.providerId, weeklySchedule: DEFAULT_SCHEDULE, isOnVacation: parsed.data.isOnVacation, vacationNote: parsed.data.vacationNote || null },
    update: { isOnVacation: parsed.data.isOnVacation, vacationNote: parsed.data.vacationNote || null },
  })

  return { success: true }
}

// ============================= ONLINE STATUS =============================

export type ProviderOnlineStatus = {
  isOnline: boolean
  lastKnownLatitude: number | null
  lastKnownLongitude: number | null
  lastLocationUpdatedAt: string | null
}

export async function getMyOnlineStatus(): Promise<ProviderOnlineStatus | null> {
  const provider = await requireProvider()
  if (!provider) return null

  const availability = await db.providerAvailability.findUnique({ where: { providerId: provider.providerId } })
  // A provider whose session went quiet is not online even to themselves,
  // or the toggle would read green on a page that stopped checking in.
  return {
    isOnline: isLiveOnline(availability?.isOnline, availability?.lastSeenAt),
    lastKnownLatitude: availability?.lastKnownLatitude != null ? Number(availability.lastKnownLatitude) : null,
    lastKnownLongitude: availability?.lastKnownLongitude != null ? Number(availability.lastKnownLongitude) : null,
    lastLocationUpdatedAt: availability?.lastLocationUpdatedAt?.toISOString() ?? null,
  }
}

const heartbeatSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

const setOnlineStatusSchema = z.object({
  isOnline: z.boolean(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
})

/** The Solo Pro / staff "Go Online" toggle. Going online with a location
 * (the common case — see the one-shot getCurrentPosition call in
 * app/provider/jobs/page.tsx) is what makes this provider eligible to show
 * up on the Business Portal's technician map and nearest-staff
 * auto-assignment; going online without one (permission denied) still
 * flips the flag, it just won't appear on the map until a location is
 * captured. Going offline intentionally leaves the last known location in
 * place — it's just ignored everywhere isOnline is checked. */
export async function setOnlineStatus(input: unknown): Promise<ProviderAvailabilityActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = setOnlineStatusSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { isOnline, latitude, longitude } = parsed.data

  const locationData = latitude != null && longitude != null
    ? { lastKnownLatitude: latitude, lastKnownLongitude: longitude, lastLocationUpdatedAt: new Date() }
    : {}
  // Going online starts the clock; going offline clears it, so a stale
  // timestamp can never make an offline provider look briefly online.
  const seen = isOnline ? { lastSeenAt: new Date() } : { lastSeenAt: null }

  await db.providerAvailability.upsert({
    where: { providerId: provider.providerId },
    create: { providerId: provider.providerId, weeklySchedule: DEFAULT_SCHEDULE, isOnline, ...locationData, ...seen },
    update: { isOnline, ...locationData, ...seen },
  })

  return { success: true }
}

/**
 * "I am still here." Called on an interval by the Go Online control while
 * the provider has the app open, and the reason the green dot on the
 * customer home page means something: a provider who closed the tab, lost
 * signal or logged out stops checking in and drops out of discovery.
 *
 * Deliberately cannot turn anyone online — it only refreshes the clock for
 * someone who already is. A client able to assert its own online state
 * would defeat the mechanism, since what this guards against is precisely
 * a client that has stopped talking.
 *
 * Carries an optional fresh position, so a provider who moves while online
 * is discoverable where they actually are rather than where they switched
 * on. Only ever while online, so an offline provider is never located.
 */
export async function heartbeat(input: unknown): Promise<{ online: boolean }> {
  const provider = await requireProvider()
  if (!provider) return { online: false }

  const parsed = heartbeatSchema.safeParse(input)
  const coords = parsed.success && parsed.data.latitude != null && parsed.data.longitude != null
    ? { lastKnownLatitude: parsed.data.latitude, lastKnownLongitude: parsed.data.longitude, lastLocationUpdatedAt: new Date() }
    : {}

  const result = await db.providerAvailability.updateMany({
    where: { providerId: provider.providerId, isOnline: true },
    data: { lastSeenAt: new Date(), ...coords },
  })

  return { online: result.count > 0 }
}

const addBlockedDateSchema = z.object({
  date: z.string().min(1, "Please choose a date"),
  reason: z.string().trim().max(200).optional(),
})

export async function addBlockedDate(input: unknown): Promise<ProviderAvailabilityActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = addBlockedDateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const date = new Date(parsed.data.date)
  if (Number.isNaN(date.getTime())) return { success: false, error: "Invalid date" }

  await db.blockedDate.create({
    data: { providerId: provider.providerId, date, reason: parsed.data.reason || "Blocked" },
  })

  return { success: true }
}

const blockedDateIdSchema = z.object({ id: z.string().trim().min(1) })

export async function removeBlockedDate(input: unknown): Promise<ProviderAvailabilityActionResult> {
  const provider = await requireProvider()
  if (!provider) return { success: false, error: "You must be signed in as a provider." }

  const parsed = blockedDateIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const existing = await db.blockedDate.findUnique({ where: { id: parsed.data.id } })
  if (!existing || existing.providerId !== provider.providerId) return { success: false, error: "Not found" }

  await db.blockedDate.delete({ where: { id: parsed.data.id } })
  return { success: true }
}
