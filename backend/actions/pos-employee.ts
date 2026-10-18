"use server"

import { z } from "zod"
import bcrypt from "bcryptjs"
import { db } from "@/backend/db"
import { checkRateLimit } from "@/backend/services/rate-limit"

export async function createPosEmployeeAccount(input: unknown): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(160), password: z.string().min(8).max(200), agreeTerms: z.literal(true), verificationProof: z.string().min(10).max(200) }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Check your name, email, password and verification code." }
  const d = parsed.data
  const email = d.email.toLowerCase()
  try {
    if (!(await checkRateLimit(`pos-employee:${email}`, "signup", 5, 3600000)).allowed) return { success: false, error: "Too many attempts. Try again later." }
    // Only the verified email can claim a seat. An unverified second contact
    // must never be used to gain access to another person's invitation.
    const proofWhere = { identifier: `signup-verified:${email}`, token: d.verificationProof, expires: { gt: new Date() } }
    const proof = await db.verificationToken.findFirst({ where: proofWhere })
    if (!proof) return { success: false, error: "Verify the email your employer invited before continuing." }
    const password = await bcrypt.hash(d.password, 12)
    await db.$transaction(async tx => {
      const seat = await tx.posStaff.findFirst({ where: { email: { equals: email, mode: "insensitive" }, userId: null, isActive: true }, select: { id: true } })
      if (!seat) throw Error("No invitation")
      if ((await tx.verificationToken.deleteMany({ where: { ...proofWhere, expires: { gt: new Date() } } })).count !== 1) throw Error("Expired verification")
      const user = await tx.user.create({ data: { name: d.name, email, password, role: "PROVIDER", isActive: true, providerProfile: { create: {} } }, select: { id: true } })
      if ((await tx.posStaff.updateMany({ where: { id: seat.id, userId: null, isActive: true }, data: { userId: user.id, claimedAt: new Date() } })).count !== 1) throw Error("Invitation changed")
    })
    return { success: true }
  } catch { return { success: false, error: "Could not activate employee access. Ask the owner to add your email to Team, or sign in if you already have an account." } }
}
