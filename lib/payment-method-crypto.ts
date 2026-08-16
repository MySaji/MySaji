import crypto from "crypto"

// Encrypts the real destination number behind a PaymentMethod's masked
// display value (e.g. the full M-Pesa MSISDN behind "***1234") — needed so
// a B2C payout has a real number to send to. AES-256-GCM with a server-only
// key; nothing here is ever sent to the client.

function encryptionKey(): Buffer | null {
  const raw = process.env.PAYMENT_METHOD_ENCRYPTION_KEY
  if (!raw) return null
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) return null
  return key
}

export function paymentEncryptionConfigured(): boolean {
  return encryptionKey() !== null
}

/** Returns null (rather than throwing) when the key isn't configured — every
 * caller treats "can't encrypt" as "fall back to the manual payout flow",
 * never a hard failure. */
export function encryptAccountNumber(plain: string): string | null {
  const key = encryptionKey()
  if (!key) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64")
}

export function decryptAccountNumber(encoded: string): string | null {
  const key = encryptionKey()
  if (!key) return null
  try {
    const buf = Buffer.from(encoded, "base64")
    const iv = buf.subarray(0, 12)
    const authTag = buf.subarray(12, 28)
    const ciphertext = buf.subarray(28)
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}
