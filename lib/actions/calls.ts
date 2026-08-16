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
  payload: z.unknown(),
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
