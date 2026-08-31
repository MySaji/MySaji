import { GoogleGenAI } from "@google/genai"

/** Shared, lazily-created Gemini client — same one-cached-instance shape as
 * every other AI/payment SDK client in this project (see getClient() in
 * chatbot.ts, offer-extraction.ts, offer-enhancement.ts before this file
 * existed, and initiateMpesaPayment's token cache in lib/actions/payments.ts). */
let cachedClient: GoogleGenAI | null = null
export function getGeminiClient(): GoogleGenAI {
  if (!cachedClient) cachedClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  return cachedClient
}
