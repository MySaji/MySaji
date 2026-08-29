"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { logJobEvent } from "@/lib/actions/job-events"
import { pushToUser } from "@/lib/actions/push"

export type SafetyIncidentStatus = "ACTIVE" | "ESCALATED" | "EMERGENCY_SERVICES_CONTACTED" | "SAFETY_TEAM_ALERTED" | "RESOLVED"
export type SafetyActionResult = { success: true } | { success: false; error: string }
export type ReportIncidentResult = { success: true; incidentId: string } | { success: false; error: string }

const reportSchema = z.object({
  jobId: z.string().trim().min(1),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  description: z.string().trim().max(1000).optional(),
})

/** Real SOS — creates the incident, logs it to the job's Evidence Timeline,
 * and immediately notifies every active admin (not a queue nobody's
 * watching). Status starts SAFETY_TEAM_ALERTED since that notification is
 * the one real, immediate thing this system can guarantee happened. */
export async function reportSafetyIncident(input: unknown): Promise<ReportIncidentResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = reportSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const job = await db.job.findUnique({ where: { id: parsed.data.jobId }, include: { provider: true } })
  if (!job) return { success: false, error: "Job not found." }
  const isCustomer = job.customerId === session.user.id
  const isProvider = job.provider?.userId === session.user.id
  if (!isCustomer && !isProvider) return { success: false, error: "Job not found." }

  const incident = await db.safetyIncident.create({
    data: {
      jobId: job.id, reportedByUserId: session.user.id, latitude: parsed.data.latitude, longitude: parsed.data.longitude,
      description: parsed.data.description, status: "SAFETY_TEAM_ALERTED",
    },
  })

  await logJobEvent({
    jobId: job.id, type: "SAFETY_INCIDENT", actor: isCustomer ? "CUSTOMER" : "PROVIDER", actorUserId: session.user.id,
    description: "Safety incident reported, Saji safety team alerted", metadata: { incidentId: incident.id },
  })

  const admins = await db.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
  await Promise.all(admins.map((admin) =>
    db.notification.create({
      data: {
        userId: admin.id, title: "🚨 Safety incident reported", message: `A safety incident was reported on job "${job.title}".`,
        type: "SYSTEM", relatedType: "JOB", relatedId: job.id, actionUrl: "/admin/safety-incidents",
      },
    }).catch(() => {})
  ))
  await Promise.all(admins.map((admin) => pushToUser(admin.id, { title: "🚨 Safety incident reported", body: `Job "${job.title}"`, url: "/admin/safety-incidents" }, "job")))

  return { success: true, incidentId: incident.id }
}

const escalateSchema = z.object({ incidentId: z.string().trim().min(1) })

/** Records that the reporter tapped through to actually dial emergency
 * services (a real tel: link on the client) — this app has no dispatch API
 * to call on their behalf, so this is an honest record of "the person was
 * pointed at 999/112," not a claim that Saji contacted them directly. */
export async function markEmergencyServicesContacted(input: unknown): Promise<SafetyActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = escalateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const incident = await db.safetyIncident.findUnique({ where: { id: parsed.data.incidentId }, include: { job: { include: { provider: true } } } })
  if (!incident) return { success: false, error: "Incident not found." }
  const isCustomer = incident.job.customerId === session.user.id
  const isProvider = incident.job.provider?.userId === session.user.id
  if (!isCustomer && !isProvider) return { success: false, error: "Incident not found." }

  await db.safetyIncident.update({ where: { id: incident.id }, data: { status: "EMERGENCY_SERVICES_CONTACTED" } })
  await logJobEvent({ jobId: incident.jobId, type: "SAFETY_INCIDENT_ESCALATED", actor: isCustomer ? "CUSTOMER" : "PROVIDER", actorUserId: session.user.id, description: "Emergency services contacted" })

  return { success: true }
}

const resolveSchema = z.object({ incidentId: z.string().trim().min(1), resolutionNote: z.string().trim().optional() })

export async function resolveSafetyIncident(input: unknown): Promise<SafetyActionResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "admin") return { success: false, error: "Not authorized." }

  const parsed = resolveSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const incident = await db.safetyIncident.findUnique({ where: { id: parsed.data.incidentId } })
  if (!incident) return { success: false, error: "Incident not found." }

  await db.safetyIncident.update({ where: { id: incident.id }, data: { status: "RESOLVED", resolutionNote: parsed.data.resolutionNote || null, resolvedAt: new Date() } })
  await logJobEvent({ jobId: incident.jobId, type: "SAFETY_INCIDENT_RESOLVED", actor: "ADMIN", actorUserId: session.user.id, description: "Safety incident resolved" })

  return { success: true }
}

export type SafetyIncidentItem = {
  id: string
  jobId: string
  jobTitle: string
  reportedByName: string
  latitude: number | null
  longitude: number | null
  description: string | null
  status: SafetyIncidentStatus
  createdAt: string
  resolvedAt: string | null
}

export async function getActiveSafetyIncidentsForAdmin(): Promise<SafetyIncidentItem[]> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "admin") return []

  const incidents = await db.safetyIncident.findMany({
    where: { status: { not: "RESOLVED" } },
    include: { job: true },
    orderBy: { createdAt: "desc" },
  })
  const reporterIds = [...new Set(incidents.map((i) => i.reportedByUserId))]
  const reporters = await db.user.findMany({ where: { id: { in: reporterIds } }, select: { id: true, name: true } })
  const nameById = new Map(reporters.map((u) => [u.id, u.name]))

  return incidents.map((i) => ({
    id: i.id, jobId: i.jobId, jobTitle: i.job.title, reportedByName: nameById.get(i.reportedByUserId) ?? "Unknown",
    latitude: i.latitude != null ? Number(i.latitude) : null, longitude: i.longitude != null ? Number(i.longitude) : null,
    description: i.description, status: i.status, createdAt: i.createdAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null,
  }))
}

export async function getJobSafetyIncidents(jobId: string): Promise<SafetyIncidentItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const job = await db.job.findUnique({ where: { id: jobId }, include: { provider: true } })
  if (!job) return []
  const isCustomer = job.customerId === session.user.id
  const isProvider = job.provider?.userId === session.user.id
  if (!isCustomer && !isProvider && session.user.role !== "admin") return []

  const incidents = await db.safetyIncident.findMany({ where: { jobId }, orderBy: { createdAt: "desc" } })
  const reporterIds = [...new Set(incidents.map((i) => i.reportedByUserId))]
  const reporters = await db.user.findMany({ where: { id: { in: reporterIds } }, select: { id: true, name: true } })
  const nameById = new Map(reporters.map((u) => [u.id, u.name]))

  return incidents.map((i) => ({
    id: i.id, jobId: i.jobId, jobTitle: job.title, reportedByName: nameById.get(i.reportedByUserId) ?? "Unknown",
    latitude: i.latitude != null ? Number(i.latitude) : null, longitude: i.longitude != null ? Number(i.longitude) : null,
    description: i.description, status: i.status, createdAt: i.createdAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null,
  }))
}
