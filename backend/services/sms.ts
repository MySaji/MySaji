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

/**
 * Why a send failed, as something the app can branch on.
 *
 * WHY THIS IS NOT JUST A STRING
 *
 * Infobip answers a refused send with its own prose, and that prose went
 * straight onto the signup form. On an account that cannot send — no
 * credit, suspended — every send endpoint returns
 * `403 {"text":"Unauthorized access"}` while the read endpoints keep
 * answering 200. A shopkeeper filling in their name and number was
 * therefore told "Unauthorized access", which reads as a judgement on THEM
 * and is the one thing it does not mean.
 *
 * So the reason is classified here and the words are chosen by the caller,
 * who is the only one that knows whether another channel is available.
 *
 *   unconfigured — no credentials in the environment
 *   unavailable  — the provider will not send for us: no credit, bad key,
 *                  suspended account, outage. Nothing the person did.
 *   undeliverable— the provider accepted the request but the message
 *                  cannot reach that number.
 */
export type SmsFailureReason = "unconfigured" | "unavailable" | "undeliverable"

export type SendPinResult =
  | { sent: true; pinId: string }
  | { sent: false; reason: SmsFailureReason; error: string; providerDetail?: string }

/** Sends a 2FA PIN via Infobip's dedicated 2FA product — unlike a raw SMS
 * send, Infobip generates and stores the PIN itself; this app only ever
 * learns the opaque `pinId`, never the PIN value, and must call
 * verifyInfobipPin() (against that same pinId) to check a code later. */
export async function sendInfobipPin(phone: string): Promise<SendPinResult> {
  if (!infobipConfigured()) {
    return { sent: false, reason: "unconfigured", error: "Text messages are not set up on this site." }
  }

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
      // 401/403 here is about OUR account with Infobip, never about the
      // person signing up. Kept as providerDetail so it reaches the server
      // log and a support conversation, and never the customer's screen.
      const detail = data?.requestError?.serviceException?.text
      const reason: SmsFailureReason =
        res.status === 401 || res.status === 403 || res.status === 402 || res.status >= 500
          ? "unavailable"
          : "undeliverable"
      if (reason === "unavailable") {
        console.error("[sms] Infobip refused the send \u2014 check the account balance and API key.", {
          status: res.status,
          detail,
        })
      }
      return {
        sent: false,
        reason,
        error:
          reason === "unavailable"
            ? "We could not send a text message just now."
            : "We could not send a code to that number. Check it and try again.",
        providerDetail: detail,
      }
    }
    // Infobip returns HTTP 200 with a valid pinId even when the SMS itself
    // was never dispatched (e.g. zero account balance) — the only place
    // that failure actually surfaces is smsStatus, not the HTTP status or
    // pinId's presence. Checking only res.ok/pinId would silently tell the
    // customer "code sent" for a message that never left Infobip.
    if (data.smsStatus && data.smsStatus !== "MESSAGE_SENT") {
      console.error("[sms] Infobip accepted the request but did not dispatch.", { smsStatus: data.smsStatus })
      return {
        sent: false,
        reason: "unavailable",
        error: "We could not send a text message just now.",
        providerDetail: String(data.smsStatus),
      }
    }
    return { sent: true, pinId: data.pinId }
  } catch (err: any) {
    // A network failure reaching Infobip is ours, not theirs and not the
    // customer's. Its message is a stack-trace artefact, so it is logged
    // rather than shown.
    console.error("[sms] Could not reach Infobip.", err?.message)
    return { sent: false, reason: "unavailable", error: "We could not send a text message just now.", providerDetail: err?.message }
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
