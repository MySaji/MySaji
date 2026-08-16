"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { checkKycDuplicate, buildKycDedupeFields, KYC_DUPLICATE_ERROR } from "@/lib/kyc-duplicate-check"

const onboardingSchema = z.object({
  shopName: z.string().trim().min(2, "Shop name is required"),
  shopCategory: z.string().trim().min(1, "Please select a category"),
  shopDescription: z.string().trim().min(1, "Please describe your shop"),
  shopLogo: z.string().nullable().optional(),
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

export type CompleteShopkeeperOnboardingResult = { success: true } | { success: false; error: string }

export async function completeShopkeeperOnboarding(input: unknown): Promise<CompleteShopkeeperOnboardingResult> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== "shopkeeper") {
    return { success: false, error: "You must be signed in as a shopkeeper to do this." }
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
    const profile = await db.shopkeeperProfile.findUnique({ where: { userId } })
    if (!profile) {
      return { success: false, error: "Shop profile not found for this account." }
    }

    await db.$transaction(async (tx) => {
      await tx.shopkeeperProfile.update({
        where: { userId },
        data: {
          shopName: data.shopName,
          shopCategory: data.shopCategory,
          shopDescription: data.shopDescription,
          shopLogoUrl: data.shopLogo ?? undefined,
          businessLicense: data.businessPermit ?? undefined,
          kraPin: data.kraPIN || undefined,
        },
      })

      await tx.address.create({
        data: {
          userId,
          label: "Shop Location",
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
    // Prisma's interactive-transaction default timeout is 5000ms — this
    // transaction writes two base64-encoded ID photos (often several MB)
    // over this environment's slow pooler connection, which reliably blew
    // past that default ("Transaction already closed... 91396 ms passed
    // since the start of the transaction" observed live) and silently
    // rolled back with no row ever written. 60s gives real photo uploads
    // enough headroom on a slow connection.

    return { success: true }
  } catch {
    // Most commonly a transient DB-connection blip in this environment
    // (see project memory: severe pooler latency to us-east-1) — surface
    // as a retryable message instead of letting the client hang forever.
    return { success: false, error: "Couldn't reach the server. Please check your connection and try again." }
  }
}
