import { createHash } from "crypto"
import { db } from "@/backend/db"

/** Strips whitespace/dashes and uppercases so "123-456", "123 456", and
 * "123456" are all recognized as the same document number. */
export function normalizeDocumentNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "")
}

/** SHA-256 of the exact file content (these are base64 data: URLs) — an
 * exact-reuse check, not a perceptual/similarity match. Catches the common
 * case (the same photo file uploaded again under a different account)
 * without pulling in an image-similarity dependency for a fuzzier match. */
export function hashDataUrl(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/** Every KYC submission site should spread this into its `kycDocument.create`
 * data so future submissions can be checked against it via an indexed
 * lookup instead of re-hashing every historical photo on each check. */
export function buildKycDedupeFields(input: {
  documentNumber?: string | null
  idFileUrl?: string | null
  idBackFileUrl?: string | null
}) {
  return {
    documentNumberNormalized: input.documentNumber?.trim() ? normalizeDocumentNumber(input.documentNumber) : null,
    idFileHash: input.idFileUrl ? hashDataUrl(input.idFileUrl) : null,
    idBackFileHash: input.idBackFileUrl ? hashDataUrl(input.idBackFileUrl) : null,
  }
}

export type KycDuplicateCheck = { isDuplicate: boolean }

/** Blocks a KYC submission if the document number or ID photo (front or
 * back) exactly matches one already on file for a DIFFERENT account —
 * regardless of that prior submission's review status (PENDING/APPROVED/
 * REJECTED all count, since a rejected submission still proves the document
 * was already tied to another account). `excludeUserId` is omitted only for
 * brand-new signups (no account exists yet to exclude); every other call
 * site passes the submitting user's own id so switching roles or
 * re-submitting on the SAME account is never flagged against itself — this
 * app's account switcher (see lib/actions/account-switch.ts) lets one real
 * person legitimately hold several roles, each needing its own KYC pass, on
 * a single account. */
export async function checkKycDuplicate(input: {
  excludeUserId?: string
  documentNumber?: string | null
  idFileUrl?: string | null
  idBackFileUrl?: string | null
}): Promise<KycDuplicateCheck> {
  const { documentNumberNormalized, idFileHash, idBackFileHash } = buildKycDedupeFields(input)

  const orConditions: Record<string, string>[] = []
  if (documentNumberNormalized) orConditions.push({ documentNumberNormalized })
  if (idFileHash) orConditions.push({ idFileHash })
  if (idBackFileHash) orConditions.push({ idBackFileHash })
  if (orConditions.length === 0) return { isDuplicate: false }

  const match = await db.kycDocument.findFirst({
    where: {
      OR: orConditions,
      ...(input.excludeUserId ? { userId: { not: input.excludeUserId } } : {}),
    },
    select: { id: true },
  })

  return { isDuplicate: !!match }
}

export const KYC_DUPLICATE_ERROR = "This identification document has already been used to verify a different account. If you believe this is a mistake, please contact support."
