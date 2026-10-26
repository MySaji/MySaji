import { randomUUID } from "node:crypto"

/** Infobip authentication template, using the application's existing provider. */
export async function sendWhatsAppOtp(phone: string, code: string): Promise<{ sent: true } | { sent: false; error: string }> {
  const { INFOBIP_BASE_URL: base, INFOBIP_API_KEY: key, INFOBIP_WHATSAPP_SENDER: sender, INFOBIP_WHATSAPP_OTP_TEMPLATE: template } = process.env
  if (!base || !key || !sender || !template) return { sent: false, error: "WhatsApp verification is not configured yet. Choose SMS or email instead." }
  if (!/^\+254[17]\d{8}$/.test(phone) || !/^\d{6}$/.test(code)) return { sent: false, error: "Use a valid Kenyan mobile number." }
  try {
    const url = new URL("/whatsapp/1/message/template", base)
    if (url.protocol !== "https:") return { sent: false, error: "WhatsApp verification is unavailable. Choose SMS or email." }
    const response = await fetch(url, {
      method: "POST", headers: { Authorization: `App ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ messages: [{ from: sender.replace(/\D/g, ""), to: phone.slice(1), messageId: randomUUID(), content: { templateName: template, language: process.env.INFOBIP_WHATSAPP_OTP_LANGUAGE || "en", templateData: { body: { placeholders: [code] }, buttons: [{ type: "URL", parameter: code }] } }, validityPeriod: { amount: 10, timeUnit: "MINUTES" } }] }),
    })
    const result = await response.json()
    const message = result?.messages?.[0] ?? result
    if (!response.ok || !message?.messageId || !["PENDING", "DELIVERED"].includes(message?.status?.groupName)) return { sent: false, error: "WhatsApp could not accept the verification message. Choose SMS or try again later." }
    // Accepted/queued is not a claim that the handset has received it.
    return { sent: true }
  } catch { return { sent: false, error: "WhatsApp verification is unavailable right now. Choose SMS or try again later." } }
}
