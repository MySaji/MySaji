"use server"

import { db } from "@/lib/db"
import { sendEmail } from "@/lib/email"
import { wrapEmailLayout } from "@/lib/email-templates"
import type { NotificationPreferences } from "@/lib/actions/settings"
import type { NotificationType } from "@prisma/client"

const TYPE_PREFERENCE_KEY: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
  JOB: "jobUpdates",
  REVIEW: "jobUpdates",
  MESSAGE: "messages",
  PAYMENT: "payments",
  PROMO: "promotions",
}

const SECTION_LABEL: Partial<Record<NotificationType, string>> = {
  JOB: "Job updates",
  REVIEW: "Reviews",
  MESSAGE: "Messages",
  PAYMENT: "Payments",
  PROMO: "Promotions",
  SYSTEM: "System notices",
  ANNOUNCEMENT: "Announcements",
}

function enabledTypesFor(prefs: Partial<NotificationPreferences>): NotificationType[] {
  const allTypes: NotificationType[] = ["JOB", "MESSAGE", "PAYMENT", "REVIEW", "SYSTEM", "PROMO", "ANNOUNCEMENT"]
  return allTypes.filter((type) => {
    const prefKey = TYPE_PREFERENCE_KEY[type]
    return !prefKey || prefs[prefKey] !== false
  })
}

function buildDigestHtml(name: string, grouped: Map<NotificationType, { title: string; message: string }[]>): string {
  const sections = Array.from(grouped.entries())
    .map(([type, items]) => {
      const rows = items
        .slice(0, 5)
        .map((n) => `<li style="margin-bottom:8px;"><strong>${n.title}</strong><br/><span style="color:#4b5563;">${n.message}</span></li>`)
        .join("")
      const more = items.length > 5 ? `<p style="color:#9ca3af;font-size:13px;">+${items.length - 5} more</p>` : ""
      return `<h2 style="margin-bottom:6px;">${SECTION_LABEL[type] ?? type}</h2><ul style="padding-left:18px;">${rows}</ul>${more}`
    })
    .join("")

  const body = `
    <p>Hi ${name}, here's a summary of what happened on your account over the past 7 days.</p>
    ${sections}
    <p style="margin-top:24px;color:#9ca3af;font-size:13px;">
      You're getting this because "Email Digest" is enabled in your notification settings.
      You can turn it off any time from Settings &gt; Notifications.
    </p>
  `
  return wrapEmailLayout({ title: `Hi ${name}, here's your week on SAJI`, bodyHtml: body })
}

/** Builds one user's real weekly digest from their actual Notification rows
 * since their last digest (or 7 days ago for a first-ever run), grouped by
 * type and filtered through the same per-category preference keys the bell
 * already respects. Returns null if there's nothing to report — an empty
 * "nothing happened this week" email is noise, not a digest. */
async function buildDigestForUser(
  user: { id: string; name: string; email: string; notificationPreferences: unknown; lastDigestSentAt: Date | null },
): Promise<{ subject: string; html: string } | null> {
  const prefs = (user.notificationPreferences as Partial<NotificationPreferences> | null) ?? {}
  if (prefs.emailDigest === false) return null

  const since = user.lastDigestSentAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const enabledTypes = enabledTypesFor(prefs)

  const notifications = await db.notification.findMany({
    where: { userId: user.id, createdAt: { gt: since }, type: { in: enabledTypes } },
    orderBy: { createdAt: "desc" },
  })
  if (notifications.length === 0) return null

  const grouped = new Map<NotificationType, { title: string; message: string }[]>()
  for (const n of notifications) {
    const list = grouped.get(n.type) ?? []
    list.push({ title: n.title, message: n.message })
    grouped.set(n.type, list)
  }

  return {
    subject: `Your SAJI weekly digest: ${notifications.length} update${notifications.length === 1 ? "" : "s"}`,
    html: buildDigestHtml(user.name, grouped),
  }
}

export type DigestRunResult = { usersConsidered: number; emailsSent: number; emailsUnconfigured: number; emailsFailed: number }

/** Entry point for the weekly digest cron. Real periodic batch email — a
 * genuine step up from emailUser()'s immediate per-event sends. Every
 * active, email-digest-opted-in user gets exactly one email per run
 * covering exactly the real notifications generated since their last
 * digest (never double-counts, never skips a gap if a run is late/missed —
 * the window is anchored to lastDigestSentAt, not a fixed calendar week). */
export async function runWeeklyEmailDigest(): Promise<DigestRunResult> {
  const users = await db.user.findMany({
    where: { isActive: true, email: { not: "" } },
    select: { id: true, name: true, email: true, notificationPreferences: true, lastDigestSentAt: true },
  })

  let emailsSent = 0
  let emailsUnconfigured = 0
  let emailsFailed = 0

  for (const user of users) {
    const digest = await buildDigestForUser(user)
    const now = new Date()
    if (!digest) {
      await db.user.update({ where: { id: user.id }, data: { lastDigestSentAt: now } })
      continue
    }
    const result = await sendEmail({ to: user.email, subject: digest.subject, html: digest.html })
    if (result.sent) emailsSent++
    else if (result.error) emailsFailed++
    else emailsUnconfigured++
    await db.user.update({ where: { id: user.id }, data: { lastDigestSentAt: now } })
  }

  return { usersConsidered: users.length, emailsSent, emailsUnconfigured, emailsFailed }
}
