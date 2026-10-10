"use server"

import { z } from "zod"
import { generateChatbotReply, type ChatbotHistoryTurn } from "@/backend/services/ai/chatbot"
import { checkRateLimit, getClientIp } from "@/backend/services/rate-limit"

// Anonymous landing-page chat — no session, no DB persistence (the
// conversation lives only in the browser tab's own React state, same as
// this action's history param), so an escalate-to-a-human path doesn't
// apply here (there's no account/ticket to attach it to). Deliberately
// separate from lib/actions/chatbot.ts's signed-in flow rather than adding
// an anonymous branch to it — that one's shape (ChatbotConversation row,
// unread badges, escalation) is all account-scoped by design.
const turnSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })
const sendSchema = z.object({
  history: z.array(turnSchema).max(20),
  message: z.string().trim().min(1, "Type a message first").max(2000),
})

export type GuestChatbotResult =
  | { success: true; reply: string; simulated: boolean }
  | { success: false; error: string }

export async function sendGuestChatbotMessage(input: unknown): Promise<GuestChatbotResult> {
  const parsed = sendSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }

  // IP-keyed, not per-account (there is no account) — this is the only
  // real cost control standing between the public landing page and
  // unbounded paid-API spend from a script.
  const ip = await getClientIp()
  const rateLimit = await checkRateLimit(`guest-chatbot:${ip}`, "guest-chatbot-message", 20, 10 * 60 * 1000)
  if (!rateLimit.allowed) {
    return { success: false, error: `Too many messages. Please try again in ${Math.ceil(rateLimit.retryAfterSeconds / 60)} minute(s), or sign in for full support chat.` }
  }

  const history: ChatbotHistoryTurn[] = [...parsed.data.history, { role: "user", content: parsed.data.message }]
  const { content, simulated } = await generateChatbotReply(history)
  return { success: true, reply: content, simulated }
}
