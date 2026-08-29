"use server"

import { z } from "zod"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { generateChatbotReply } from "@/lib/ai/chatbot"
import { pushToUser } from "@/lib/actions/push"

async function requireUser() {
  const session = await auth()
  if (!session?.user?.id) return null
  return session
}

const WELCOME_MESSAGE =
  "Hi! I'm SAJI Assistant. I can help with questions about bookings, orders, payments, and how SAJI works. If you need a real person, just ask. I can connect you with our support team. How can I help today?"

export type ChatbotMessageItem = {
  id: string
  role: "USER" | "ASSISTANT" | "STAFF"
  content: string
  senderName: string | null
  createdAt: string
}

export type ChatbotConversationData = {
  id: string
  status: "ACTIVE" | "ESCALATED" | "CLOSED"
  assignedStaffName: string | null
  messages: ChatbotMessageItem[]
} | null

function mapMessage(m: { id: string; role: "USER" | "ASSISTANT" | "STAFF"; content: string; createdAt: Date; sender?: { name: string } | null }): ChatbotMessageItem {
  return { id: m.id, role: m.role, content: m.content, senderName: m.sender?.name ?? null, createdAt: m.createdAt.toISOString() }
}

/** Finds the caller's most recent open conversation, or starts a fresh one
 * with a real persisted welcome message. Also marks any unread bot/staff
 * replies as read, since opening the chat is what "reading" them means.
 * Safe to poll repeatedly — used for near-live updates once a human joins. */
export async function getMyChatbotConversation(): Promise<ChatbotConversationData> {
  const session = await requireUser()
  if (!session?.user?.id) return null

  let conversation = await db.chatbotConversation.findFirst({
    where: { userId: session.user.id, status: { in: ["ACTIVE", "ESCALATED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      assignedStaff: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { name: true } } } },
    },
  })

  if (!conversation) {
    conversation = await db.chatbotConversation.create({
      data: { userId: session.user.id, messages: { create: { role: "ASSISTANT", content: WELCOME_MESSAGE } } },
      include: {
        assignedStaff: { select: { name: true } },
        messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { name: true } } } },
      },
    })
  }

  await db.chatbotMessage.updateMany({
    where: { conversationId: conversation.id, role: { in: ["ASSISTANT", "STAFF"] }, isRead: false },
    data: { isRead: true },
  })

  return {
    id: conversation.id,
    status: conversation.status,
    assignedStaffName: conversation.assignedStaff?.name ?? null,
    messages: conversation.messages.map(mapMessage),
  }
}

export async function getChatbotUnreadCount(): Promise<number> {
  const session = await requireUser()
  if (!session?.user?.id) return 0
  return db.chatbotMessage.count({
    where: { role: { in: ["ASSISTANT", "STAFF"] }, isRead: false, conversation: { userId: session.user.id } },
  })
}

const sendSchema = z.object({
  conversationId: z.string().trim().min(1),
  message: z.string().trim().min(1, "Type a message first").max(2000),
})

export type SendChatbotMessageResult =
  | { success: true; reply: ChatbotMessageItem | null; simulated: boolean }
  | { success: false; error: string }

export async function sendChatbotMessage(input: unknown): Promise<SendChatbotMessageResult> {
  const session = await requireUser()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = sendSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  try {
    const conversation = await db.chatbotConversation.findUnique({
      where: { id: parsed.data.conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    })
    if (!conversation || conversation.userId !== session.user.id) {
      return { success: false, error: "Conversation not found." }
    }
    if (conversation.status === "CLOSED") {
      return { success: false, error: "This conversation has been resolved. Please start a new one." }
    }

    await db.chatbotMessage.create({
      data: { conversationId: conversation.id, role: "USER", content: parsed.data.message },
    })
    await db.chatbotConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })

    // Once escalated, a real human owns this thread — the bot stays quiet so
    // it doesn't talk over whoever's actually helping (or about to).
    if (conversation.status === "ESCALATED") {
      return { success: true, reply: null, simulated: false }
    }

    const history = [
      ...conversation.messages
        .filter((m) => m.role !== "STAFF")
        .map((m) => ({ role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: parsed.data.message },
    ]

    const { content, simulated } = await generateChatbotReply(history)

    const replyRow = await db.chatbotMessage.create({
      data: { conversationId: conversation.id, role: "ASSISTANT", content },
    })
    await db.chatbotConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })

    return { success: true, reply: mapMessage(replyRow), simulated }
  } catch {
    return { success: false, error: "Something went wrong sending your message. Please try again." }
  }
}

const conversationIdSchema = z.object({ conversationId: z.string().trim().min(1) })

export type EndChatbotResult = { success: true } | { success: false; error: string }

/** User-initiated "End conversation" — closes the thread so the next
 * message (or the next time the widget opens) starts a genuinely fresh
 * conversation instead of continuing this one. Distinct from staff/system
 * closing a resolved ticket: this is the user choosing to be done, from
 * either the ACTIVE (bot-only) or ESCALATED (human-joined) state. */
export async function endChatbotConversation(input: unknown): Promise<EndChatbotResult> {
  const session = await requireUser()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = conversationIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const conversation = await db.chatbotConversation.findUnique({ where: { id: parsed.data.conversationId } })
  if (!conversation || conversation.userId !== session.user.id) {
    return { success: false, error: "Conversation not found." }
  }
  if (conversation.status === "CLOSED") return { success: true }

  await db.chatbotConversation.update({ where: { id: conversation.id }, data: { status: "CLOSED" } })
  return { success: true }
}

export type ChatbotHistoryItem = {
  id: string
  closedAt: string
  wasEscalated: boolean
  messageCount: number
  lastMessagePreview: string | null
}

/** Past, closed conversations for the "history" screen shown after a user
 * ends a session — lets them glance back at what was discussed before
 * starting a fresh one, and choose which old ones to delete. */
export async function getMyChatbotConversationHistory(): Promise<ChatbotHistoryItem[]> {
  const session = await requireUser()
  if (!session?.user?.id) return []

  const conversations = await db.chatbotConversation.findMany({
    where: { userId: session.user.id, status: "CLOSED" },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  })

  return conversations.map((c) => ({
    id: c.id,
    closedAt: c.updatedAt.toISOString(),
    wasEscalated: c.escalatedTicketId != null,
    messageCount: c._count.messages,
    lastMessagePreview: c.messages[0]?.content ?? null,
  }))
}

export type DeleteChatbotConversationResult = { success: true } | { success: false; error: string }

/** Permanently removes a closed conversation (and its messages, cascaded)
 * from the user's history. Only closed conversations can be deleted this
 * way — the active thread doesn't appear in the history list at all. */
export async function deleteChatbotConversation(input: unknown): Promise<DeleteChatbotConversationResult> {
  const session = await requireUser()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = conversationIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const conversation = await db.chatbotConversation.findUnique({ where: { id: parsed.data.conversationId } })
  if (!conversation || conversation.userId !== session.user.id) {
    return { success: false, error: "Conversation not found." }
  }
  if (conversation.status !== "CLOSED") {
    return { success: false, error: "Only closed conversations can be deleted." }
  }

  await db.chatbotConversation.delete({ where: { id: conversation.id } })
  return { success: true }
}

export type EscalateChatbotResult = { success: true } | { success: false; error: string }

const REVIEWER_PORTAL_PATH: Record<string, string> = {
  ADMIN: "/admin/chatbot",
  SUB_ADMIN: "/sub-admin/chatbot",
  AGENT: "/agent/chatbot",
}

/** Connects the user to a real human — creates a genuine SupportTicket
 * (not a scripted fake reply) carrying the full transcript, marks the
 * conversation ESCALATED, and notifies every Admin/Sub-Admin/Agent (the
 * same reviewer set Shop Upgrade Requests uses) with a role-correct link.
 * Whichever one accepts it can then chat with the customer for real. */
export async function escalateChatbotConversation(input: unknown): Promise<EscalateChatbotResult> {
  const session = await requireUser()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = conversationIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  try {
    const conversation = await db.chatbotConversation.findUnique({
      where: { id: parsed.data.conversationId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    })
    if (!conversation || conversation.userId !== session.user.id) {
      return { success: false, error: "Conversation not found." }
    }
    if (conversation.status === "ESCALATED") return { success: true }

    const transcript = conversation.messages
      .map((m) => `${m.role === "USER" ? "Customer" : "Assistant"}: ${m.content}`)
      .join("\n")

    let escalationReviewers: { id: string; role: string }[] = []
    await db.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({
        data: {
          userId: session.user!.id,
          category: "chatbot_escalation",
          subject: "Chatbot escalation: requested human support",
          message: transcript,
        },
      })

      await tx.chatbotConversation.update({
        where: { id: conversation.id },
        data: { status: "ESCALATED", escalatedTicketId: ticket.id },
      })

      await tx.chatbotMessage.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: "I've connected you with our support team. Someone will pick this up shortly and reply here directly.",
        },
      })

      const reviewers = await tx.user.findMany({
        where: { role: { in: ["ADMIN", "SUB_ADMIN", "AGENT"] }, isActive: true },
        select: { id: true, role: true },
      })
      if (reviewers.length > 0) {
        await tx.notification.createMany({
          data: reviewers.map((r) => ({
            userId: r.id,
            title: "Chatbot escalation",
            message: `${session.user!.name ?? "A user"} asked to speak with a human support agent.`,
            type: "SYSTEM" as const,
            relatedType: "SupportTicket",
            relatedId: ticket.id,
            actionUrl: REVIEWER_PORTAL_PATH[r.role] ?? "/admin/chatbot",
          })),
        })
        escalationReviewers = reviewers
      }
    }, { timeout: 15000 })

    await Promise.all(escalationReviewers.map((r) =>
      pushToUser(r.id, {
        title: "Chatbot escalation",
        body: `${session.user!.name ?? "A user"} asked to speak with a human support agent.`,
        url: REVIEWER_PORTAL_PATH[r.role] ?? "/admin/chatbot",
      }),
    ))

    return { success: true }
  } catch {
    return { success: false, error: "Something went wrong connecting you with support. Please try again." }
  }
}
