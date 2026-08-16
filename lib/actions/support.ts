"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export type SupportTicketItem = {
  id: string
  subject: string
  category: string
  status: string
  createdAt: string
  updatedAt: string
}

export async function getSupportTickets(): Promise<SupportTicketItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const tickets = await db.supportTicket.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" } })
  return tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    category: t.category,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }))
}

const createTicketSchema = z.object({
  category: z.string().trim().min(1, "Please select a category"),
  subject: z.string().trim().min(1, "Subject is required"),
  message: z.string().trim().optional(),
})

export type SupportActionResult = { success: true } | { success: false; error: string }

export async function createSupportTicket(input: unknown): Promise<SupportActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = createTicketSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  const { category, subject, message } = parsed.data

  await db.supportTicket.create({ data: { userId: session.user.id, category, subject, message: message || subject } })
  return { success: true }
}
