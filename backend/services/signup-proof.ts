import "server-only"

import { db } from "@/backend/db"

import { normalizeKenyanPhone } from "@/backend/services/sms"

export async function isSignupProofValid(email: string, phone: string, proof: string): Promise<boolean> {
  const normalizedPhone = normalizeKenyanPhone(phone) ?? phone
  const match = await db.verificationToken.findFirst({
    where: {
      token: proof,
      expires: { gt: new Date() },
      OR: [{ identifier: `signup-verified:${email.toLowerCase()}` }, { identifier: `signup-verified:${normalizedPhone}` }],
    },
  })
  return Boolean(match)
}

export async function consumeSignupProof(email: string, phone: string, proof: string): Promise<void> {
  const normalizedPhone = normalizeKenyanPhone(phone) ?? phone
  await db.verificationToken.deleteMany({
    where: { token: proof, OR: [{ identifier: `signup-verified:${email.toLowerCase()}` }, { identifier: `signup-verified:${normalizedPhone}` }] },
  })
}
