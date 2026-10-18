import webpush from "web-push"

function vapidConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let configured = false
function ensureConfigured() {
  if (configured || !vapidConfigured()) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  configured = true
}

export type PushPayload = { title: string; body: string; url?: string; recipientId?: string; tag?: string }

/** Sends a real Web Push notification to one subscription. Silently no-ops
 * if VAPID isn't configured (self-generated keys, so this only happens if
 * they were never set up) or if the push fails — a failed push should never
 * break the calling code path (e.g. a job status update shouldn't error out
 * just because a stale browser subscription 410'd). */
export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<{ sent: boolean; expired?: boolean }> {
  if (!vapidConfigured()) return { sent: false }
  ensureConfigured()

  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
    )
    return { sent: true }
  } catch (err: any) {
    // 404/410 means the browser unsubscribed or the subscription expired —
    // the caller should delete it rather than keep retrying forever.
    return { sent: false, expired: err?.statusCode === 404 || err?.statusCode === 410 }
  }
}
