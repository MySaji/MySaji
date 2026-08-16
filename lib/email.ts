import nodemailer from "nodemailer"

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS)
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null

function getTransporter() {
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return transporter
}

export type EmailAttachment = { filename: string; content: Buffer; contentType?: string }

/** Real SMTP send when configured; otherwise an honest no-op so callers can
 * fall back to an on-screen display instead of pretending an email went
 * out — same env-var-gated pattern as every payment gateway in
 * lib/actions/payments.ts. `attachments` passes straight through to
 * nodemailer (used for PDF receipts, see lib/actions/receipts.ts).
 *
 * The branded header logo (see lib/email-templates.ts's wrapEmailLayout)
 * is a plain remote <img src="{CALLBACK_URL}/icon-192.png">, not a CID or
 * base64-embedded one — both of those were tried and rejected: base64
 * data: URIs don't render at all in Gmail, and CID attachments render but
 * show up as a visible "logo.png" attachment chip in Gmail's inbox list
 * regardless of contentDisposition. A plain remote URL has zero attachment
 * footprint in every client, at the cost of needing CALLBACK_URL to
 * actually resolve at send time — the same dependency every other
 * absolute link already sent in this app's emails has. */
export async function sendEmail(input: { to: string; subject: string; html: string; attachments?: EmailAttachment[] }): Promise<{ sent: boolean; error?: string }> {
  if (!smtpConfigured()) return { sent: false }

  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    })
    return { sent: true }
  } catch (err: any) {
    return { sent: false, error: err?.message ?? "Failed to send email" }
  }
}
