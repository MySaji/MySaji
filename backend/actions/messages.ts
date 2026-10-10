"use server"

import { z } from "zod"
import { isBlockedFrom, recordViolations, reportUser } from "@/backend/services/moderation-core"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { ROLE_DB_TO_APP, ROLE_APP_TO_DB } from "@/backend/services/role-map"
import { pushToUser } from "@/backend/actions/push"
import { canMessage, messageableRolesFor, ROLE_LABEL } from "@/backend/domain/message-permissions"
import { maskContactInfo } from "@/backend/domain/contact-info-filter"
import type { UserRole } from "@/backend/domain/types"

export type ConversationSummary = {
  id: string
  otherUserId: string
  name: string
  avatar: string | null
  role: string
  lastMessage: string
  lastMessageAt: string | null
  unreadCount: number
  jobId: string | null
  // Real presence, not decorative — sourced from ProviderAvailability's
  // "Go Online/Offline" toggle (see that model's own doc comment). Only
  // providers have this concept in the schema today, so it's null (not
  // false) for every other role rather than faking an offline/online state
  // nothing actually tracks.
  isOnline: boolean | null
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const myId = session.user.id

  const conversations = await db.conversation.findMany({
    where: { OR: [{ participantAId: myId }, { participantBId: myId }] },
    include: {
      participantA: { include: { providerProfile: { include: { category: true, availability: { select: { isOnline: true } } } } } },
      participantB: { include: { providerProfile: { include: { category: true, availability: { select: { isOnline: true } } } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { lastMessageAt: "desc" },
  })

  const result: ConversationSummary[] = []
  for (const conv of conversations) {
    const other = conv.participantAId === myId ? conv.participantB : conv.participantA
    const unreadCount = await db.message.count({ where: { conversationId: conv.id, senderId: other.id, isRead: false } })
    const lastMessage = conv.messages[0]
    const otherAppRole = ROLE_DB_TO_APP[other.role]
    result.push({
      id: conv.id,
      otherUserId: other.id,
      name: other.name,
      avatar: other.image,
      role: otherAppRole === "provider" ? (other.providerProfile?.category?.name ?? "Provider") : ROLE_LABEL[otherAppRole],
      lastMessage: lastMessage ? (lastMessage.type === "TEXT" ? lastMessage.content ?? "" : "Sent an attachment") : "No messages yet",
      lastMessageAt: conv.lastMessageAt?.toISOString() ?? null,
      unreadCount,
      jobId: conv.jobId,
      isOnline: other.providerProfile?.availability?.isOnline ?? null,
    })
  }
  return result
}

export async function getUnreadMessageCount(): Promise<number> {
  const session = await auth()
  if (!session?.user?.id) return 0
  const myId = session.user.id

  const conversations = await db.conversation.findMany({
    where: { OR: [{ participantAId: myId }, { participantBId: myId }] },
    select: { id: true },
  })
  if (conversations.length === 0) return 0

  return db.message.count({
    where: { conversationId: { in: conversations.map((c) => c.id) }, senderId: { not: myId }, isRead: false },
  })
}

/** The message a reply is quoting, flattened to what the bubble renders.
 *  Null once the quoted message has been deleted — the reply survives it. */
export type QuotedMessage = {
  id: string
  type: string
  content: string | null
  isMine: boolean
}

export type ChatMessage = {
  id: string
  senderId: string
  isMine: boolean
  type: string
  content: string | null
  attachmentUrl: string | null
  isRead: boolean
  createdAt: string
  replyTo: QuotedMessage | null
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const conversation = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation || (conversation.participantAId !== session.user.id && conversation.participantBId !== session.user.id)) return []

  await db.message.updateMany({
    where: { conversationId, senderId: { not: session.user.id }, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })

  const messages = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    // Only the quoted message's own fields — deliberately not its own
    // replyTo, so a long reply chain doesn't fan out into nested loads.
    include: { replyTo: { select: { id: true, type: true, content: true, senderId: true } } },
  })
  return messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    isMine: m.senderId === session.user!.id,
    type: m.type,
    content: m.content,
    attachmentUrl: m.attachmentUrl,
    isRead: m.isRead,
    createdAt: m.createdAt.toISOString(),
    replyTo: m.replyTo
      ? { id: m.replyTo.id, type: m.replyTo.type, content: m.replyTo.content, isMine: m.replyTo.senderId === session.user!.id }
      : null,
  }))
}

const sendSchema = z.object({
  conversationId: z.string().trim().min(1),
  type: z.enum(["TEXT", "IMAGE", "FILE", "VOICE", "LOCATION"]),
  content: z.string().trim().optional(),
  attachmentUrl: z.string().optional(),
  replyToId: z.string().trim().min(1).optional(),
})

export type SendMessageResult = { success: true; message: ChatMessage; wasMasked: boolean } | { success: false; error: string }

export async function sendMessage(input: unknown): Promise<SendMessageResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = sendSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { conversationId, type, attachmentUrl } = parsed.data

  const conversation = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation || (conversation.participantAId !== session.user.id && conversation.participantBId !== session.user.id)) {
    return { success: false, error: "Conversation not found." }
  }

  // A block has to be enforced here, not just hidden in the UI — the send
  // action is a public endpoint, so a blocked sender who kept the page open
  // could otherwise keep writing.
  const recipientId = conversation.participantAId === session.user.id
    ? conversation.participantBId
    : conversation.participantAId
  if (await isBlockedFrom(session.user.id, recipientId)) {
    return { success: false, error: "You can't send messages to this person." }
  }

  // Gap 3 — see lib/contact-info-filter.ts. Only TEXT messages carry
  // free-form content; IMAGE/FILE/VOICE/LOCATION content is always null.
  const { masked: content, wasMasked } = type === "TEXT" && parsed.data.content
    ? maskContactInfo(parsed.data.content)
    : { masked: parsed.data.content, wasMasked: false }

  // A reply may only quote a message from this same conversation — without
  // this check the id is caller-supplied and could pull a quote out of a
  // conversation the sender has no access to.
  let replyToId: string | null = null
  if (parsed.data.replyToId) {
    const quoted = await db.message.findUnique({
      where: { id: parsed.data.replyToId },
      select: { id: true, conversationId: true },
    })
    if (quoted?.conversationId === conversationId) replyToId = quoted.id
  }

  const message = await db.message.create({
    data: { conversationId, senderId: session.user.id, type, content, attachmentUrl, replyToId },
    include: { replyTo: { select: { id: true, type: true, content: true, senderId: true } } },
  })
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })

  // Detection runs on what was actually typed, not the masked copy — once a
  // number has been replaced with bullets there is nothing left to detect.
  // Fire-and-forget: a moderation flag must never delay or fail a message.
  if (type === "TEXT" && parsed.data.content) {
    void recordViolations(session.user.id, message.id, parsed.data.content)
  }

  const otherUserId = conversation.participantAId === session.user.id ? conversation.participantBId : conversation.participantAId
  const recipient = await db.user.findUnique({ where: { id: otherUserId }, select: { role: true, name: true } })
  const messagePreview = type === "TEXT" ? (content || "Sent you a message") : "Sent you an attachment"
  // Must carry the conversation id — every portal's messages page opens
  // whichever conversation this ?conversation= query param names (the same
  // deep-link convention already used by dispute-banner.tsx and
  // provider-story-ring.tsx). Without it, clicking the notification just
  // lands on the bare inbox with nothing selected, which reads exactly like
  // "the message isn't there" even though it's sitting in the DB fine.
  const messagesUrl = `/${ROLE_DB_TO_APP[recipient?.role ?? "CUSTOMER"]}/messages?conversation=${conversationId}`

  // Deliberately no Notification row for a chat message. Chat has its own
  // surface — the inbox, badged with the real unread-message count — and
  // mirroring every message into the bell meant one message showed up twice,
  // with the bell's copy going stale the moment the conversation was read
  // (marking messages read never touched the notification).
  //
  // The push still fires: that is the OS-level alert for when the app is
  // closed, which the in-app inbox badge cannot replace.
  await pushToUser(otherUserId, { title: "New message", body: messagePreview, url: messagesUrl }, "message")

  return {
    success: true,
    message: {
      id: message.id,
      senderId: message.senderId,
      isMine: true,
      type: message.type,
      content: message.content,
      attachmentUrl: message.attachmentUrl,
      isRead: message.isRead,
      createdAt: message.createdAt.toISOString(),
      replyTo: message.replyTo
        ? { id: message.replyTo.id, type: message.replyTo.type, content: message.replyTo.content, isMine: message.replyTo.senderId === session.user!.id }
        : null,
    },
    wasMasked,
  }
}

const getOrCreateSchema = z.object({ otherUserId: z.string().trim().min(1) })

export type ConversationResult = { success: true; conversationId: string } | { success: false; error: string }

export async function getOrCreateConversation(input: unknown): Promise<ConversationResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = getOrCreateSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const otherUserId = parsed.data.otherUserId
  if (otherUserId === session.user.id) return { success: false, error: "Cannot message yourself." }

  const otherUser = await db.user.findUnique({ where: { id: otherUserId }, select: { role: true, isActive: true } })
  if (!otherUser || !otherUser.isActive) return { success: false, error: "That user is not available to message." }

  const otherRole = ROLE_DB_TO_APP[otherUser.role]
  if (!canMessage(session.user.role, otherRole)) {
    return { success: false, error: "You're not able to message this user." }
  }

  const [a, b] = [session.user.id, otherUserId].sort()
  const existing = await db.conversation.findFirst({ where: { participantAId: a, participantBId: b, jobId: null } })
  if (existing) return { success: true, conversationId: existing.id }

  const created = await db.conversation.create({ data: { participantAId: a, participantBId: b } })
  return { success: true, conversationId: created.id }
}

// One-click "contact support" for suspended/disputed account screens —
// resolves to the platform's oldest active Admin rather than making the
// user search/pick one, then reuses getOrCreateConversation's own
// canMessage check (every role can already reach Admin).
export async function getOrCreateAdminConversation(): Promise<ConversationResult> {
  const admin = await db.user.findFirst({
    where: { role: "ADMIN", isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  if (!admin) return { success: false, error: "No admin is currently available. Please try again later." }
  return getOrCreateConversation({ otherUserId: admin.id })
}

export type MessageableUser = {
  id: string
  name: string
  email: string
  avatar: string | null
  role: UserRole
  roleLabel: string
}

const searchUsersSchema = z.object({
  query: z.string().trim().max(100).optional(),
  // Admin only: narrow to one specific role instead of the full allowed set.
  roleFilter: z.enum(["customer", "provider", "shopkeeper", "admin", "sub-admin", "agent", "secretary"]).optional(),
})

/** Powers the "start new conversation" picker — scoped to whichever roles the caller is allowed to message. */
export async function searchMessageableUsers(input: unknown): Promise<MessageableUser[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const parsed = searchUsersSchema.safeParse(input)
  if (!parsed.success) return []
  const { query, roleFilter } = parsed.data

  const allowedRoles = messageableRolesFor(session.user.role)
  const effectiveRoles = roleFilter && allowedRoles.includes(roleFilter) ? [roleFilter] : allowedRoles
  const dbRoles = effectiveRoles.map((r) => ROLE_APP_TO_DB[r])

  const users = await db.user.findMany({
    where: {
      id: { not: session.user.id },
      isActive: true,
      role: { in: dbRoles },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, email: true, image: true, role: true },
    orderBy: { name: "asc" },
    take: 30,
  })

  return users.map((u) => {
    const role = ROLE_DB_TO_APP[u.role]
    return { id: u.id, name: u.name, email: u.email, avatar: u.image, role, roleLabel: ROLE_LABEL[role] }
  })
}

export async function getChatTheme(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id) return "CLASSIC"
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  return user?.chatTheme ?? "CLASSIC"
}

const themeSchema = z.object({ theme: z.enum(["CLASSIC", "AURORA", "MIDNIGHT", "SUNSET"]) })

export async function updateChatTheme(input: unknown): Promise<{ success: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false }
  const parsed = themeSchema.safeParse(input)
  if (!parsed.success) return { success: false }
  await db.user.update({ where: { id: session.user.id }, data: { chatTheme: parsed.data.theme } })
  return { success: true }
}

const deleteConvoSchema = z.object({ conversationId: z.string().trim().min(1) })

export async function clearConversation(input: unknown): Promise<{ success: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false }
  const parsed = deleteConvoSchema.safeParse(input)
  if (!parsed.success) return { success: false }

  const conversation = await db.conversation.findUnique({ where: { id: parsed.data.conversationId } })
  if (!conversation || (conversation.participantAId !== session.user.id && conversation.participantBId !== session.user.id)) {
    return { success: false }
  }

  await db.message.deleteMany({ where: { conversationId: parsed.data.conversationId } })
  return { success: true }
}

/**
 * Removes the whole conversation, not just its messages — what a long-press
 * on someone's name in the inbox does.
 *
 * This is a real delete for both people, because Conversation has no
 * per-participant "hidden" flag to hide it for one side only; adding one
 * would mean a column, a filter on every read, and an "unhide when they
 * write again" rule. The confirm dialog in the UI says as much rather than
 * implying it only disappears for you.
 */
export async function deleteConversation(input: unknown): Promise<{ success: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false }
  const parsed = deleteConvoSchema.safeParse(input)
  if (!parsed.success) return { success: false }

  const conversation = await db.conversation.findUnique({ where: { id: parsed.data.conversationId } })
  if (!conversation || (conversation.participantAId !== session.user.id && conversation.participantBId !== session.user.id)) {
    return { success: false }
  }

  // Messages first: Message.replyToId is SetNull, and the rows are removed by
  // the conversation's own cascade anyway — doing it explicitly keeps the
  // order predictable rather than relying on constraint ordering.
  await db.message.deleteMany({ where: { conversationId: parsed.data.conversationId } })
  await db.conversation.delete({ where: { id: parsed.data.conversationId } })
  return { success: true }
}

// ============================= BLOCK / REPORT =============================

const conversationTargetSchema = z.object({ conversationId: z.string().trim().min(1) })

/** The other participant, or null when the caller isn't in this
 *  conversation. Every action below is scoped through this. */
async function otherParticipantId(conversationId: string, meId: string): Promise<string | null> {
  const conversation = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation) return null
  if (conversation.participantAId === meId) return conversation.participantBId
  if (conversation.participantBId === meId) return conversation.participantAId
  return null
}

export type BlockStateResult = { blocked: boolean }

/** Whether the caller has blocked the other person in this conversation. */
export async function getBlockState(conversationId: string): Promise<BlockStateResult> {
  const session = await auth()
  if (!session?.user?.id) return { blocked: false }
  const otherId = await otherParticipantId(conversationId, session.user.id)
  if (!otherId) return { blocked: false }

  const block = await db.chatBlock.findUnique({
    where: { blockerId_blockedId: { blockerId: session.user.id, blockedId: otherId } },
  })
  return { blocked: block !== null }
}

export type ModerationActionResult = { success: true; blocked?: boolean; underReview?: boolean } | { success: false; error: string }

export async function blockChatUser(input: unknown): Promise<ModerationActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = conversationTargetSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const otherId = await otherParticipantId(parsed.data.conversationId, session.user.id)
  if (!otherId) return { success: false, error: "Conversation not found." }

  // Idempotent: pressing block twice is not an error to show someone.
  await db.chatBlock.upsert({
    where: { blockerId_blockedId: { blockerId: session.user.id, blockedId: otherId } },
    update: {},
    create: { blockerId: session.user.id, blockedId: otherId },
  })
  return { success: true, blocked: true }
}

export async function unblockChatUser(input: unknown): Promise<ModerationActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = conversationTargetSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const otherId = await otherParticipantId(parsed.data.conversationId, session.user.id)
  if (!otherId) return { success: false, error: "Conversation not found." }

  await db.chatBlock.deleteMany({ where: { blockerId: session.user.id, blockedId: otherId } })
  return { success: true, blocked: false }
}

const reportSchema = z.object({
  conversationId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(200),
})

/**
 * Reports the other person in a conversation. The snapshot is their most
 * recent message, so an admin has the thing being complained about rather
 * than a bare accusation.
 */
export async function reportChatUser(input: unknown): Promise<ModerationActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }
  const parsed = reportSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const otherId = await otherParticipantId(parsed.data.conversationId, session.user.id)
  if (!otherId) return { success: false, error: "Conversation not found." }

  const lastFromThem = await db.message.findFirst({
    where: { conversationId: parsed.data.conversationId, senderId: otherId },
    orderBy: { createdAt: "desc" },
    select: { content: true, type: true },
  })
  const snapshot = lastFromThem?.content ?? `(${lastFromThem?.type ?? "no"} message)`

  const outcome = await reportUser({
    reporterId: session.user.id,
    reportedUserId: otherId,
    reason: parsed.data.reason,
    contentSnapshot: snapshot,
  })
  if (!outcome.recorded) return { success: false, error: outcome.reason }
  return { success: true, underReview: outcome.underReview }
}

const deleteMessageSchema = z.object({ messageId: z.string().trim().min(1) })

/**
 * Deletes one message. Only the sender's own, which is why this checks
 * senderId rather than conversation membership: being in a conversation must
 * not let someone erase what the other person said.
 */
export async function deleteMessage(input: unknown): Promise<{ success: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { success: false }
  const parsed = deleteMessageSchema.safeParse(input)
  if (!parsed.success) return { success: false }

  const result = await db.message.deleteMany({
    where: { id: parsed.data.messageId, senderId: session.user.id },
  })
  return { success: result.count > 0 }
}
