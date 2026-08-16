"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { checkKycDuplicate, buildKycDedupeFields, KYC_DUPLICATE_ERROR } from "@/lib/kyc-duplicate-check"

const onboardingSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is required"),
  description: z.string().trim().min(1, "Please describe your company"),
  logo: z.string().nullable().optional(),
  county: z.string().trim().min(1, "Please select a county"),
  town: z.string().trim().min(1, "Town/area is required"),
  streetAddress: z.string().trim().min(1, "Street address is required"),
  buildingName: z.string().trim().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  idNumber: z.string().trim().min(1, "ID number is required"),
  idFront: z.string().min(1, "Front ID photo is required"),
  idBack: z.string().min(1, "Back ID photo is required"),
  selfie: z.string().min(1, "Please upload or capture a selfie"),
  businessPermit: z.string().nullable().optional(),
  kraPIN: z.string().trim().optional(),
})

export type CompleteDistributorOnboardingResult = { success: true } | { success: false; error: string }

export async function completeDistributorOnboarding(input: unknown): Promise<CompleteDistributorOnboardingResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "distributor") {
    return { success: false, error: "You must be signed in as a distributor to do this." }
  }

  const parsed = onboardingSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const data = parsed.data
  const userId = session.user.id

  const dup = await checkKycDuplicate({ excludeUserId: userId, documentNumber: data.idNumber, idFileUrl: data.idFront, idBackFileUrl: data.idBack })
  if (dup.isDuplicate) {
    return { success: false, error: KYC_DUPLICATE_ERROR }
  }

  try {
    const profile = await db.distributorProfile.findUnique({ where: { userId } })
    if (!profile) {
      return { success: false, error: "Company profile not found for this account." }
    }

    await db.$transaction(async (tx) => {
      await tx.distributorProfile.update({
        where: { userId },
        data: {
          companyName: data.companyName,
          description: data.description,
          logoUrl: data.logo ?? undefined,
          businessLicense: data.businessPermit ?? undefined,
          kraPin: data.kraPIN || undefined,
        },
      })

      await tx.address.create({
        data: {
          userId,
          label: "Company HQ",
          type: "OFFICE",
          address: data.buildingName ? `${data.streetAddress}, ${data.buildingName}` : data.streetAddress,
          city: `${data.town}, ${data.county}`,
          latitude: data.latitude,
          longitude: data.longitude,
          isDefault: true,
        },
      })

      await tx.kycDocument.create({
        data: {
          userId,
          documentType: "NATIONAL_ID",
          documentNumber: data.idNumber,
          idFileUrl: data.idFront,
          idBackFileUrl: data.idBack,
          selfieFileUrl: data.selfie,
          ...buildKycDedupeFields({ documentNumber: data.idNumber, idFileUrl: data.idFront, idBackFileUrl: data.idBack }),
        },
      })

      await tx.user.update({ where: { id: userId }, data: { kycStatus: "PENDING" } })
    }, { timeout: 60000, maxWait: 10000 })
    // Same 60s timeout as completeShopkeeperOnboarding — this transaction writes
    // several base64-encoded photos over this environment's slow pooler
    // connection, which blows past Prisma's 5000ms default.

    return { success: true }
  } catch {
    return { success: false, error: "Couldn't reach the server. Please check your connection and try again." }
  }
}
