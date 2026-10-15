"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { logAdminAction } from "@/backend/services/admin-audit-core"
import { pushToUser } from "@/backend/services/push-core"

// Same combined role gate as lib/actions/shop-upgrade-requests.ts — one
// shared action file across Admin/Sub-Admin/Agent rather than three
// near-duplicate per-portal files.
async function requireChatbotReviewer(): Promise<{ userId: string; name: string } | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  if (!["admin", "sub-admin", "agent"].includes(session.user.role)) return null
  return { userId: session.user.id, name: session.user.name ?? "Staff" }
}

export type ChatbotConversationSummary = {
  id: string
  userName: string
  userEmail: string
  userRole: string
  status: "ACTIVE" | "ESCALATED" | "CLOSED"
  lastMessagePreview: string
  messageCount: number
  updatedAt: string
  escalatedTicketId: string | null
  assignedStaffId: string | null
  assignedStaffName: string | null
}

export async function getChatbotConversations(): Promise<ChatbotConversationSummary[]> {
  const reviewer = await requireChatbotReviewer()
  if (!reviewer) return []

  const conversations = await db.chatbotConversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      user: { select: { name: true, email: true, role: true } },
      assignedStaff: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { messages: true } },
    },
  })

  return conversations.map((c) => ({
    id: c.id,
    userName: c.user.name,
    userEmail: c.user.email,
    userRole: c.user.role,
    status: c.status,
    lastMessagePreview: c.messages[0]?.content ?? "",
    messageCount: c._count.messages,
    updatedAt: c.updatedAt.toISOString(),
    escalatedTicketId: c.escalatedTicketId,
    assignedStaffId: c.assignedStaffId,
    assignedStaffName: c.assignedStaff?.name ?? null,
  }))
}

export type ChatbotConversationDetail = {
  id: string
  userName: string
  userEmail: string
  status: "ACTIVE" | "ESCALATED" | "CLOSED"
  escalatedTicketId: string | null
  assignedStaffId: string | null
  assignedStaffName: string | null
  messages: { id: string; role: "USER" | "ASSISTANT" | "STAFF"; content: string; senderName: string | null; createdAt: string }[]
} | null

export async function getChatbotConversationDetail(conversationId: string): Promise<ChatbotConversationDetail> {
  const reviewer = await requireChatbotReviewer()
  if (!reviewer) return null

  const conversation = await db.chatbotConversation.findUnique({
    where: { id: conversationId },
    include: {
      user: { select: { name: true, email: true } },
      assignedStaff: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { name: true } } } },
    },
  })
  if (!conversation) return null

  return {
    id: conversation.id,
    userName: conversation.user.name,
    userEmail: conversation.user.email,
    status: conversation.status,
    escalatedTicketId: conversation.escalatedTicketId,
    assignedStaffId: conversation.assignedStaffId,
    assignedStaffName: conversation.assignedStaff?.name ?? null,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      senderName: m.sender?.name ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

export async function getPendingChatbotEscalationCount(): Promise<number> {
  const reviewer = await requireChatbotReviewer()
  if (!reviewer) return 0
  return db.chatbotConversation.count({ where: { status: "ESCALATED", assignedStaffId: null } })
}

const conversationIdSchema = z.object({ conversationId: z.string().trim().min(1) })

export type ChatbotAdminActionResult = { success: true } | { success: false; error: string }

/** First-claim-wins — the reviewer who accepts an escalation becomes the
 * only one who can send STAFF replies. Idempotent for the same reviewer
 * (re-opening an already-claimed-by-you conversation doesn't error). */
export async function claimChatbotConversation(input: unknown): Promise<ChatbotAdminActionResult> {
  const reviewer = await requireChatbotReviewer()
  if (!reviewer) return { success: false, error: "You must be signed in as Admin, Sub-Admin, or Agent." }

  const parsed = conversationIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  try {
    const conversation = await db.chatbotConversation.findUnique({ where: { id: parsed.data.conversationId } })
    if (!conversation) return { success: false, error: "Conversation not found." }
    if (conversation.assignedStaffId && conversation.assignedStaffId !== reviewer.userId) {
      return { success: false, error: "Someone else already accepted this conversation." }
    }

    await db.$transaction(async (tx) => {
      await tx.chatbotConversation.update({
        where: { id: conversation.id },
        data: { assignedStaffId: reviewer.userId },
      })
      if (!conversation.assignedStaffId) {
        await tx.chatbotMessage.create({
          data: {
            conversationId: conversation.id,
            role: "STAFF",
            senderId: reviewer.userId,
            content: `Hi, I'm ${reviewer.name} from the SAJI support team. I've got your conversation. How can I help?`,
          },
        })
      }
    })

    return { success: true }
  } catch {
    return { success: false, error: "Something went wrong accepting this conversation. Please try again." }
  }
}

const staffMessageSchema = z.object({
  conversationId: z.string().trim().min(1),
  message: z.string().trim().min(1, "Type a message first").max(2000),
})

export type SendStaffMessageResult =
  | { success: true; message: { id: string; role: "STAFF"; content: string; senderName: string | null; createdAt: string } }
  | { success: false; error: string }

/** Real human-to-human reply — only the reviewer who claimed this
 * conversation can send. Notifies the customer the same way
 * lib/actions/messages.ts's sendMessage does (in-app notification + push). */
export async function sendStaffChatMessage(input: unknown): Promise<SendStaffMessageResult> {
  const reviewer = await requireChatbotReviewer()
  if (!reviewer) return { success: false, error: "You must be signed in as Admin, Sub-Admin, or Agent." }

  const parsed = staffMessageSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  try {
    const conversation = await db.chatbotConversation.findUnique({ where: { id: parsed.data.conversationId } })
    if (!conversation) return { success: false, error: "Conversation not found." }
    if (conversation.status === "CLOSED") return { success: false, error: "This conversation is already closed." }
    if (conversation.assignedStaffId !== reviewer.userId) {
      return { success: false, error: "You haven't accepted this conversation yet." }
    }

    const created = await db.chatbotMessage.create({
      data: { conversationId: conversation.id, role: "STAFF", senderId: reviewer.userId, content: parsed.data.message },
    })
    await db.chatbotConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } })

    await db.notification.create({
      data: {
        userId: conversation.userId,
        title: "New reply from SAJI Support",
        message: `${reviewer.name}: ${parsed.data.message.slice(0, 100)}`,
        type: "MESSAGE",
        relatedType: "ChatbotConversation",
        relatedId: conversation.id,
        actionUrl: "/chatbot",
      },
    })
    await pushToUser(conversation.userId, { title: "New reply from SAJI Support", body: parsed.data.message, url: "/chatbot" }, "message")

    return {
      success: true,
      message: { id: created.id, role: "STAFF", content: created.content, senderName: reviewer.name, createdAt: created.createdAt.toISOString() },
    }
  } catch {
    return { success: false, error: "Something went wrong sending your message. Please try again." }
  }
}

/** Marks a conversation resolved — also closes the linked SupportTicket if
 * this one was escalated, so the two stay in sync rather than drifting. */
export async function closeChatbotConversation(input: unknown): Promise<ChatbotAdminActionResult> {
  const reviewer = await requireChatbotReviewer()
  if (!reviewer) return { success: false, error: "You must be signed in as Admin, Sub-Admin, or Agent." }

  const parsed = conversationIdSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  try {
    const conversation = await db.chatbotConversation.findUnique({ where: { id: parsed.data.conversationId } })
    if (!conversation) return { success: false, error: "Conversation not found." }

    await db.$transaction(async (tx) => {
      await tx.chatbotConversation.update({ where: { id: conversation.id }, data: { status: "CLOSED" } })
      if (conversation.escalatedTicketId) {
        await tx.supportTicket.update({ where: { id: conversation.escalatedTicketId }, data: { status: "RESOLVED" } })
      }
    })

    await logAdminAction({
      userId: reviewer.userId,
      action: "chatbot_conversation.close",
      entityType: "ChatbotConversation",
      entityId: conversation.id,
    })

    return { success: true }
  } catch {
    return { success: false, error: "Something went wrong closing this conversation. Please try again." }
  }
}
