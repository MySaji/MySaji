import "server-only"
import { createHash, randomBytes } from "node:crypto"
import { db } from "@/backend/db"

const digest = (value: string) => createHash("sha256").update(value).digest("hex")

export async function issueLoginProof(userId: string): Promise<string> {
  const proof = randomBytes(32).toString("hex")
  await db.verificationToken.create({ data: {
    identifier: `login-proof:${userId}`, token: digest(proof),
    expires: new Date(Date.now() + 2 * 60_000),
  } })
  return proof
}

export async function consumeLoginProof(userId: string, proof: unknown): Promise<boolean> {
  if (typeof proof !== "string" || !/^[a-f0-9]{64}$/.test(proof)) return false
  const consumed = await db.verificationToken.deleteMany({ where: {
    identifier: `login-proof:${userId}`, token: digest(proof), expires: { gt: new Date() },
  } })
  return consumed.count === 1
}
