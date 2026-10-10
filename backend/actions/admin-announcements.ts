"use server"

import { z } from "zod"
import { db } from "@/backend/db"
import { requireAdmin, logAdminAction } from "@/backend/actions/admin-dashboard"
import { pushToUser } from "@/backend/actions/push"

export type AdminAnnouncement = {
  id: string
  title: string
  message: string
  audience: string
  status: "draft" | "scheduled" | "sent"
  sentAt: string | null
  views: number
  type: string
}

const AUDIENCE_LABEL: Record<string, string> = {
  ALL: "All Users", PROVIDERS: "Providers", SHOPKEEPERS: "Shopkeepers", DISTRIBUTORS: "Distributors",
  CUSTOMERS: "Customers", AGENTS: "Agents", INTERNAL_TEAM: "Internal Team",
}
const AUDIENCE_TO_DB: Record<string, "ALL" | "PROVIDERS" | "SHOPKEEPERS" | "DISTRIBUTORS" | "CUSTOMERS" | "AGENTS" | "INTERNAL_TEAM"> = {
  "All Users": "ALL", "Providers": "PROVIDERS", "Shopkeepers": "SHOPKEEPERS", "Distributors": "DISTRIBUTORS",
  "Customers": "CUSTOMERS", "Agents": "AGENTS", "Internal Team": "INTERNAL_TEAM",
}
const STATUS_FROM_DB: Record<string, "draft" | "scheduled" | "sent"> = { DRAFT: "draft", SCHEDULED: "scheduled", SENT: "sent" }

export async function getAnnouncements(): Promise<AdminAnnouncement[]> {
  const admin = await requireAdmin()
  if (!admin) return []

  const announcements = await db.announcement.findMany({ orderBy: { createdAt: "desc" } })
  return announcements.map((a) => ({
    id: a.id,
    title: a.title,
    message: a.message,
    audience: AUDIENCE_LABEL[a.audience] ?? a.audience,
    status: STATUS_FROM_DB[a.status] ?? "draft",
    sentAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    views: a.views,
    type: a.type.toLowerCase(),
  }))
}

export type AdminAnnouncementActionResult = { success: true } | { success: false; error: string }

const createSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  message: z.string().trim().min(1, "Message is required"),
  audience: z.string().trim().min(1),
})

export async function createAnnouncement(input: unknown): Promise<AdminAnnouncementActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = createSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  const announcement = await db.announcement.create({
    data: {
      title: parsed.data.title,
      message: parsed.data.message,
      audience: AUDIENCE_TO_DB[parsed.data.audience] ?? "ALL",
      status: "DRAFT",
      createdById: admin.userId,
    },
  })

  await logAdminAction({
    userId: admin.userId,
    action: "announcement.create",
    entityType: "Announcement",
    entityId: announcement.id,
    newValues: { title: parsed.data.title, audience: parsed.data.audience },
  })

  return { success: true }
}

const idSchema = z.object({ id: z.string().trim().min(1) })

const AUDIENCE_ROLES: Record<string, string[]> = {
  ALL: ["CUSTOMER", "PROVIDER", "SHOPKEEPER", "DISTRIBUTOR", "AGENT", "SECRETARY", "SUB_ADMIN"],
  PROVIDERS: ["PROVIDER"],
  SHOPKEEPERS: ["SHOPKEEPER"],
  DISTRIBUTORS: ["DISTRIBUTOR"],
  CUSTOMERS: ["CUSTOMER"],
  AGENTS: ["AGENT"],
  INTERNAL_TEAM: ["AGENT", "SECRETARY", "SUB_ADMIN"],
}

export async function sendAnnouncement(input: unknown): Promise<AdminAnnouncementActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const announcement = await db.announcement.findUnique({ where: { id: parsed.data.id } })
  if (!announcement) return { success: false, error: "Announcement not found." }
  if (announcement.status === "SENT") return { success: false, error: "This announcement was already sent." }

  const roles = AUDIENCE_ROLES[announcement.audience] ?? []
  const recipients = await db.user.findMany({
    where: { role: { in: roles as never[] }, isActive: true, deletedAt: null },
    select: { id: true },
  })

  await db.$transaction([
    db.announcement.update({ where: { id: announcement.id }, data: { status: "SENT", publishedAt: new Date() } }),
    db.notification.createMany({
      data: recipients.map((u) => ({
        userId: u.id,
        title: announcement.title,
        message: announcement.message,
        type: "ANNOUNCEMENT" as const,
        relatedType: "ANNOUNCEMENT",
        relatedId: announcement.id,
      })),
    }),
  ])

  await Promise.all(recipients.map((u) =>
    pushToUser(u.id, { title: announcement.title, body: announcement.message, url: "/notifications" }),
  ))

  await logAdminAction({
    userId: admin.userId,
    action: "announcement.send",
    entityType: "Announcement",
    entityId: announcement.id,
    newValues: { recipientCount: recipients.length },
  })

  return { success: true }
}

export async function deleteAnnouncement(input: unknown): Promise<AdminAnnouncementActionResult> {
  const admin = await requireAdmin()
  if (!admin) return { success: false, error: "You must be signed in as an admin." }

  const parsed = idSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const announcement = await db.announcement.findUnique({ where: { id: parsed.data.id } })
  if (!announcement) return { success: false, error: "Announcement not found." }

  await db.announcement.delete({ where: { id: announcement.id } })

  await logAdminAction({
    userId: admin.userId,
    action: "announcement.delete",
    entityType: "Announcement",
    entityId: announcement.id,
    oldValues: { title: announcement.title },
  })

  return { success: true }
}
