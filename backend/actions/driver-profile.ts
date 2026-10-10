"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

export type DriverProfileData = {
  vehicleType: string | null
  licensePlate: string | null
  licenseNumber: string | null
  isAvailable: boolean
} | null

export async function getMyDriverProfile(): Promise<DriverProfileData> {
  const session = await auth()
  if (!session?.user?.id) return null

  const profile = await db.driverProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return null
  return { vehicleType: profile.vehicleType, licensePlate: profile.licensePlate, licenseNumber: profile.licenseNumber, isAvailable: profile.isAvailable }
}

const registerSchema = z.object({
  vehicleType: z.string().trim().min(1, "Vehicle type is required"),
  licensePlate: z.string().trim().min(1, "License plate is required"),
  licenseNumber: z.string().trim().min(1, "Driving license number is required"),
})

export type DriverActionResult = { success: true } | { success: false; error: string }

/** Real, optional capability any signed-in account can add — same
 * multi-profile pattern as switchActiveRole's customer/provider/shopkeeper
 * profiles, just not wired into that switcher (see the schema comment on
 * User.driverProfile for why). */
export async function registerAsDriver(input: unknown): Promise<DriverActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  await db.driverProfile.upsert({
    where: { userId: session.user.id },
    update: { vehicleType: parsed.data.vehicleType, licensePlate: parsed.data.licensePlate, licenseNumber: parsed.data.licenseNumber },
    create: { userId: session.user.id, vehicleType: parsed.data.vehicleType, licensePlate: parsed.data.licensePlate, licenseNumber: parsed.data.licenseNumber },
  })

  return { success: true }
}

export async function setDriverAvailability(isAvailable: boolean): Promise<DriverActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const result = await db.driverProfile.updateMany({ where: { userId: session.user.id }, data: { isAvailable } })
  if (result.count === 0) return { success: false, error: "Register as a driver first." }
  return { success: true }
}
