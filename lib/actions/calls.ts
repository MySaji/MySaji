"use server"

import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { auth } from "@/auth"
import { db } from "@/lib/db"

/** How long an unconsumed signal stays "live" for a poller to pick up.
 * Call setup only ever needs the last few seconds of signals — this also
 * doubles as a lower bound on how quickly a genuinely stale/abandoned
 * offer stops appearing as "incoming" to a client that reconnects late. */
const SIGNAL_WINDOW_MS = 30_000

async function requireParticipant(conversationId: string, userId: string) {
  const conversation = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation || (conversation.participantAId !== userId && conversation.participantBId !== userId)) {
    return null
  }
  return conversation
}

const signalTypeSchema = z.enum(["offer", "answer", "ice-candidate", "hangup", "reject"])

const sendSignalSchema = z.object({
  conversationId: z.string().trim().min(1),
  type: signalTypeSchema,
  payload: z.any(),
})

export type CallActionResult = { success: true } | { success: false; error: string }

/** Relays one WebRTC signaling message (SDP offer/answer, an ICE candidate,
 * or a hangup/reject event) to the other participant in the conversation —
 * this app has no persistent WebSocket server, so `getCallSignals` below is
 * polled instead of pushed, same reasoning as the existing 5s message poll
 * but faster since call setup is latency-sensitive. */
export async function sendCallSignal(input: unknown): Promise<CallActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = sendSignalSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }
  const { conversationId, type, payload } = parsed.data

  const conversation = await requireParticipant(conversationId, session.user.id)
  if (!conversation) return { success: false, error: "Conversation not found." }

  const toUserId = conversation.participantAId === session.user.id ? conversation.participantBId : conversation.participantAId

  await db.callSignal.create({
    data: {
      conversationId,
      fromUserId: session.user.id,
      toUserId,
      type,
      payload: (payload ?? {}) as Prisma.InputJsonValue,
    },
  })

  // Call history is built from the signals themselves, because they are the
  // only messages guaranteed to be sent — a call cannot happen without them.
  //
  // The row is created on the OFFER, not at the end. Ending a call fires a
  // hangup at the same moment the page tears its polling down, and that
  // request is routinely cancelled; logging only at the end lost calls
  // entirely. Created up front, a call always appears in history, and the
  // later signals only refine it.
  if (type === "offer") {
    const recent = await db.callLog.findFirst({
      where: { conversationId, callerId: session.user.id, createdAt: { gt: new Date(Date.now() - SIGNAL_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
    // Re-offers during setup are the same call, not a second one.
    if (!recent) {
      await db.callLog.create({
        data: { conversationId, callerId: session.user.id, calleeId: toUserId, outcome: "MISSED", durationSeconds: 0 },
      }).catch(() => {})
    }
  }

  if (type === "answer" || type === "hangup" || type === "reject") {
    const info = (payload ?? {}) as { durationSeconds?: number; wasConnected?: boolean }
    const open = await db.callLog.findFirst({
      where: { conversationId, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, outcome: true, answeredAt: true },
    })
    if (open) {
      // An answer proves it connected; a hangup carries the duration; a
      // reject means the callee turned it down. A hangup after an answer
      // must not downgrade COMPLETED back to MISSED.
      const outcome =
        type === "answer" ? "COMPLETED"
        : type === "reject" ? (open.outcome === "COMPLETED" ? "COMPLETED" : "DECLINED")
        : info.wasConnected || open.outcome === "COMPLETED" ? "COMPLETED"
        : open.outcome
      // Duration is measured from the answer, server-side. The client's own
      // counter travels on the hangup, which is the least reliable signal of
      // the three — timing it here means a call still shows its real length
      // even when that message is lost.
      const elapsed = open.answeredAt ? Math.floor((Date.now() - open.answeredAt.getTime()) / 1000) : 0
      const duration = type === "hangup"
        ? Math.max(elapsed, Math.floor(info.durationSeconds ?? 0))
        : undefined

      await db.callLog.update({
        where: { id: open.id },
        data: {
          outcome,
          ...(type === "answer" && !open.answeredAt ? { answeredAt: new Date() } : {}),
          ...(duration != null && duration > 0 ? { durationSeconds: duration } : {}),
        },
      }).catch(() => {})
    }
  }

  return { success: true }
}

export type CallSignalItem = {
  id: string
  fromUserId: string
  type: string
  payload: unknown
  createdAt: string
}

/** Polled by useVoiceCall while a conversation is open — returns recent
 * signals addressed to the current user for that conversation. */
export async function getCallSignals(conversationId: string): Promise<CallSignalItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []

  const conversation = await requireParticipant(conversationId, session.user.id)
  if (!conversation) return []

  const signals = await db.callSignal.findMany({
    where: {
      conversationId,
      toUserId: session.user.id,
      createdAt: { gt: new Date(Date.now() - SIGNAL_WINDOW_MS) },
    },
    orderBy: { createdAt: "asc" },
  })

  return signals.map((s) => ({
    id: s.id,
    fromUserId: s.fromUserId,
    type: s.type,
    payload: s.payload,
    createdAt: s.createdAt.toISOString(),
  }))
}

const logCallSchema = z.object({
  conversationId: z.string().trim().min(1),
  outcome: z.enum(["COMPLETED", "MISSED", "DECLINED"]),
  durationSeconds: z.number().int().min(0).max(60 * 60 * 12),
})

/**
 * Records a finished call for the Calls tab.
 *
 * Written by the caller only — they are the side that knows when it started
 * and how it ended, and logging from both would put every call in the list
 * twice. The row is per-conversation, so both people see it either way.
 */
export async function logCall(input: unknown): Promise<CallActionResult> {
  const session = await auth()
  if (!session?.user?.id) return { success: false, error: "You must be signed in." }

  const parsed = logCallSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: "Invalid input" }

  const conversation = await requireParticipant(parsed.data.conversationId, session.user.id)
  if (!conversation) return { success: false, error: "Conversation not found." }

  const calleeId = conversation.participantAId === session.user.id
    ? conversation.participantBId
    : conversation.participantAId

  await db.callLog.create({
    data: {
      conversationId: parsed.data.conversationId,
      callerId: session.user.id,
      calleeId,
      outcome: parsed.data.outcome,
      durationSeconds: parsed.data.durationSeconds,
    },
  })
  return { success: true }
}

export type CallHistoryItem = {
  id: string
  conversationId: string
  otherUserId: string
  otherUserName: string
  otherUserAvatar: string | null
  /** From the viewer's point of view, not the record's. */
  direction: "outgoing" | "incoming"
  outcome: "COMPLETED" | "MISSED" | "DECLINED"
  durationSeconds: number
  createdAt: string
}

/** Every call this user made or received, newest first. */
export async function getCallHistory(limit = 50): Promise<CallHistoryItem[]> {
  const session = await auth()
  if (!session?.user?.id) return []
  const myId = session.user.id

  const logs = await db.callLog.findMany({
    where: { OR: [{ callerId: myId }, { calleeId: myId }] },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      caller: { select: { id: true, name: true, image: true } },
      callee: { select: { id: true, name: true, image: true } },
    },
  })

  return logs.map((log) => {
    const outgoing = log.callerId === myId
    const other = outgoing ? log.callee : log.caller
    return {
      id: log.id,
      conversationId: log.conversationId,
      otherUserId: other.id,
      otherUserName: other.name,
      otherUserAvatar: other.image,
      direction: outgoing ? ("outgoing" as const) : ("incoming" as const),
      outcome: log.outcome as CallHistoryItem["outcome"],
      durationSeconds: log.durationSeconds,
      createdAt: log.createdAt.toISOString(),
    }
  })
}

/** Cleans up leftover signaling rows once a call ends — they're already
 * outside the polling window within 30s regardless, this just avoids
 * letting them pile up in the table. */
export async function clearCallSignals(conversationId: string): Promise<void> {
  const session = await auth()
  if (!session?.user?.id) return
  const conversation = await requireParticipant(conversationId, session.user.id)
  if (!conversation) return
  await db.callSignal.deleteMany({ where: { conversationId } })
}
