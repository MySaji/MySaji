import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-haiku-4-5"

// Same env-gated pattern as every other paid third-party integration in this
// project (M-Pesa/Stripe/PayPal in lib/actions/payments.ts) — fully real
// when ANTHROPIC_API_KEY is set, honestly degraded when it isn't, never a
// silent/fake success.
function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

let cachedClient: Anthropic | null = null
function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return cachedClient
}

const SYSTEM_PROMPT = `You are SAJI Assistant, a support chatbot for SAJI — a Kenya-focused marketplace connecting customers with home-service providers (electricians, plumbers, cleaners, carpenters, movers, AC repair, freelance designers, handymen) and local shops selling products.

What you can help with:
- Explaining how booking a service works (browse a category, pick a provider, choose a date/time, pay via M-Pesa/card/PayPal, the provider is notified).
- Explaining how shopping works (browse a shop's products, add to cart, check out, the shop prepares/ships the order).
- Explaining wallet top-ups, coins, and live shopping streams.
- Explaining provider/shopkeeper KYC verification (government ID + selfie, reviewed by SAJI staff, usually within 1-2 business days).
- General account, payment, and policy questions, and troubleshooting common issues.

What you must NOT do:
- You do not have access to this specific user's account data (their orders, bookings, wallet balance, messages). If asked something account-specific ("where is my order", "why was I charged"), say plainly that you can't see their account details from here, and offer to connect them with a real support agent.
- Never invent order numbers, prices, dates, or policies you're not certain about.

Tone: friendly, concise, practical — this is a support chat, not a sales pitch. Keep replies to 2-4 sentences unless the question genuinely needs more. If the user seems stuck, frustrated, or explicitly asks for a human, proactively offer to escalate to a real support agent.`

export type ChatbotHistoryTurn = { role: "user" | "assistant"; content: string }
export type ChatbotReplyResult = { content: string; simulated: boolean }

const SIMULATED_REPLY =
  "I'm not fully set up yet — my AI connection hasn't been configured by the SAJI team. I can still connect you with a real support agent if you'd like, just ask."

export async function generateChatbotReply(history: ChatbotHistoryTurn[]): Promise<ChatbotReplyResult> {
  if (!isConfigured()) {
    return { content: SIMULATED_REPLY, simulated: true }
  }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    })
    const textBlock = response.content.find((block) => block.type === "text")
    const content = textBlock && "text" in textBlock ? textBlock.text.trim() : ""
    return { content: content || "Sorry, I couldn't generate a response. Please try again.", simulated: false }
  } catch {
    return {
      content: "Sorry, I'm having trouble responding right now. Please try again in a moment, or ask me to connect you with a real support agent.",
      simulated: false,
    }
  }
}
