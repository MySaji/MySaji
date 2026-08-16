function infobipConfigured(): boolean {
  return Boolean(process.env.INFOBIP_BASE_URL && process.env.INFOBIP_API_KEY && process.env.INFOBIP_2FA_APPLICATION_ID && process.env.INFOBIP_2FA_MESSAGE_ID)
}

/** Normalizes common Kenyan phone input shapes (0712345678, 712345678,
 * 254712345678, +254712345678) to the E.164 form used everywhere else in
 * this app. Returns null if the input doesn't look like a Kenyan number. */
export function normalizeKenyanPhone(raw: string): string | null {
  const digits = raw.trim().replace(/[^\d+]/g, "")
  if (/^\+254\d{9}$/.test(digits)) return digits
  if (/^254\d{9}$/.test(digits)) return `+${digits}`
  if (/^0\d{9}$/.test(digits)) return `+254${digits.slice(1)}`
  if (/^\d{9}$/.test(digits)) return `+254${digits}`
  return null
}

function infobipHeaders() {
  return {
    Authorization: `App ${process.env.INFOBIP_API_KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

export type SendPinResult = { sent: true; pinId: string } | { sent: false; error: string }

/** Sends a 2FA PIN via Infobip's dedicated 2FA product — unlike a raw SMS
 * send, Infobip generates and stores the PIN itself; this app only ever
 * learns the opaque `pinId`, never the PIN value, and must call
 * verifyInfobipPin() (against that same pinId) to check a code later. */
export async function sendInfobipPin(phone: string): Promise<SendPinResult> {
  if (!infobipConfigured()) return { sent: false, error: "SMS service is not configured." }

  const msisdn = phone.replace(/^\+/, "") // Infobip's 2FA `to` field expects MSISDN without a leading +
  try {
    const res = await fetch(`${process.env.INFOBIP_BASE_URL}/2fa/2/pin`, {
      method: "POST",
      headers: infobipHeaders(),
      body: JSON.stringify({
        applicationId: process.env.INFOBIP_2FA_APPLICATION_ID,
        messageId: process.env.INFOBIP_2FA_MESSAGE_ID,
        to: msisdn,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data?.pinId) {
      return { sent: false, error: data?.requestError?.serviceException?.text ?? "Failed to send verification code." }
    }
    // Infobip returns HTTP 200 with a valid pinId even when the SMS itself
    // was never dispatched (e.g. zero account balance) — the only place
    // that failure actually surfaces is smsStatus, not the HTTP status or
    // pinId's presence. Checking only res.ok/pinId would silently tell the
    // customer "code sent" for a message that never left Infobip.
    if (data.smsStatus && data.smsStatus !== "MESSAGE_SENT") {
      return { sent: false, error: "SMS could not be delivered. Please try again later or use email instead." }
    }
    return { sent: true, pinId: data.pinId }
  } catch (err: any) {
    return { sent: false, error: err?.message ?? "Failed to send verification code." }
  }
}

export type VerifyPinResult = { valid: true } | { valid: false; error: string }

export async function verifyInfobipPin(pinId: string, pin: string): Promise<VerifyPinResult> {
  try {
    const res = await fetch(`${process.env.INFOBIP_BASE_URL}/2fa/2/pin/${pinId}/verify`, {
      method: "POST",
      headers: infobipHeaders(),
      body: JSON.stringify({ pin }),
    })
    const data = await res.json()
    if (res.ok && data?.verified) return { valid: true }
    if (res.ok && data?.verified === false) return { valid: false, error: "Invalid verification code." }
    return { valid: false, error: data?.requestError?.serviceException?.text ?? "Invalid or expired verification code." }
  } catch (err: any) {
    return { valid: false, error: err?.message ?? "Could not verify the code." }
  }
}
