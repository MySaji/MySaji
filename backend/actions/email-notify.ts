"use server"

import { db } from "@/backend/db"
import { sendEmail } from "@/backend/services/email"
import { wrapEmailLayout } from "@/backend/services/email-templates"
import type { NotificationPreferences } from "@/backend/actions/settings"

/** Real transactional email for a real event, gated by the user's actual
 * `emailDigest` toggle in Settings — previously a fully inert preference
 * with no delivery channel behind it at all. Note this is immediate
 * per-event email, not a batched periodic digest (building a true
 * scheduled batch-summary would need a cron runner this app doesn't have);
 * the toggle's real effect today is "email me about things," not "email me
 * a daily/weekly roundup." Silently no-ops if SMTP isn't configured or the
 * send fails — email delivery must never break the real action that
 * triggered it.
 *
 * `bodyHtml` is wrapped in the shared branded shell here (rather than each
 * caller wrapping its own snippet) so every one-off transactional email —
 * wallet top-ups, withdrawal payouts, etc. — carries the same SAJI header
 * and theme as the digest/newsletter emails, instead of going out as a bare
 * unbranded fragment. */
export async function emailUser(userId: string, subject: string, bodyHtml: string): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) return
    const prefs = user.notificationPreferences as Partial<NotificationPreferences> | null
    if (prefs?.emailDigest === false) return

    const html = wrapEmailLayout({ title: subject, bodyHtml })
    await sendEmail({ to: user.email, subject, html })
  } catch {
    // Never let an email failure break the real action that triggered it.
  }
}
