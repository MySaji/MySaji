import Anthropic from "@anthropic-ai/sdk"
import { Type as GeminiType } from "@google/genai"
import { getGeminiClient } from "@/lib/ai/gemini-client"
import { isAnyAiConfigured, isGeminiConfigured, isAnthropicConfigured, noteAnthropicFailure, noteGeminiFailure } from "@/lib/ai/credentials"
import { z } from "zod"

const ANTHROPIC_MODEL = "claude-haiku-4-5"
const GEMINI_MODEL = "gemini-3.5-flash"

// Same Gemini-first, Anthropic-fallback shape as lib/ai/chatbot.ts (and every
// other paid third-party integration in this project) — fully real when
// either key is set, honestly degraded when neither is. The wizard's Step 2
// always shows a real, editable manual form either way; this only decides
// whether that form starts pre-filled or blank.

let cachedAnthropicClient: Anthropic | null = null
function getAnthropicClient(): Anthropic {
  if (!cachedAnthropicClient) cachedAnthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return cachedAnthropicClient
}

const extractionResultSchema = z.object({
  title: z.string().trim().min(1).max(100).nullable(),
  categoryName: z.string().trim().nullable(),
  youOffer: z.array(z.string().trim().min(1)).max(8),
  youServe: z.array(z.string().trim().min(1)).max(5),
  fulfilment: z.array(z.enum(["DELIVERY", "PICKUP", "PROVIDER_SITE_VISIT", "SHIPPING", "REMOTE"])).max(5),
  location: z.string().trim().nullable(),
})

export type OfferExtraction = z.infer<typeof extractionResultSchema>
export type OfferExtractionResult = { simulated: true } | { simulated: false; data: OfferExtraction } | { simulated: false; data: null }

const EXTRACTION_SYSTEM_PROMPT = (categoryNames: string[]) => `You extract structured listing details from a marketplace provider's free-text description of what they offer, for the SAJI multi-service marketplace (Kenya).

Respond with ONLY a single JSON object, no markdown fences, no other text, matching exactly this shape:
{"title": string|null, "categoryName": string|null, "youOffer": string[], "youServe": string[], "fulfilment": string[], "location": string|null}

Rules:
- "title": a short, natural listing title (e.g. "Cement & Steel Supply"), or null if you can't tell.
- "categoryName": must be EXACTLY one of these existing category names, copied verbatim, or null if none genuinely fit: ${categoryNames.join(", ")}
- "youOffer": short tags for the specific items/services offered (max 8), e.g. ["Cement","Steel"].
- "youServe": who the customer is (max 5), e.g. ["Contractors","Businesses"]. Empty array if unclear.
- "fulfilment": subset of exactly these values: DELIVERY, PICKUP, PROVIDER_SITE_VISIT, SHIPPING, REMOTE. Only include ones clearly implied by the text.
- "location": a place name mentioned in the text, or null if none.
- Never invent details not implied by the text.`

const GEMINI_EXTRACTION_SCHEMA = {
  type: GeminiType.OBJECT,
  properties: {
    title: { type: GeminiType.STRING, nullable: true },
    categoryName: { type: GeminiType.STRING, nullable: true },
    youOffer: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
    youServe: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
    fulfilment: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING, enum: ["DELIVERY", "PICKUP", "PROVIDER_SITE_VISIT", "SHIPPING", "REMOTE"] } },
    location: { type: GeminiType.STRING, nullable: true },
  },
  required: ["title", "categoryName", "youOffer", "youServe", "fulfilment", "location"],
}

/** Drops the JSON parsing/validation/category-guardrail logic shared by both
 * providers — each just hands over its raw text, this does the rest. A
 * category name the model returned that isn't actually in our real list is
 * worse than no guess at all — silently dropped rather than let a
 * hallucinated category slip through to the confirm screen. */
function parseExtraction(raw: string, categoryNames: string[]): OfferExtraction | null {
  // Claude occasionally wraps JSON in ```json fences despite instructions
  // not to — strip them rather than failing the whole extraction over it.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()
  if (!cleaned) return null

  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch {
    return null
  }

  const parsed = extractionResultSchema.safeParse(json)
  if (!parsed.success) return null
  if (parsed.data.categoryName && !categoryNames.includes(parsed.data.categoryName)) {
    return { ...parsed.data, categoryName: null }
  }
  return parsed.data
}

/** Returns the extraction, or undefined to signal "try the other provider". */
async function tryGemini(description: string, categoryNames: string[]): Promise<OfferExtraction | null | undefined> {
  if (!isGeminiConfigured()) return undefined
  try {
    const response = await getGeminiClient().models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: description }] }],
      config: {
        systemInstruction: EXTRACTION_SYSTEM_PROMPT(categoryNames),
        responseMimeType: "application/json",
        responseSchema: GEMINI_EXTRACTION_SCHEMA,
      },
    })
    return parseExtraction(response.text ?? "", categoryNames)
  } catch (error) {
    noteGeminiFailure(error)
    return undefined
  }
}

/** Returns the extraction, or undefined to signal total failure. */
async function tryAnthropic(description: string, categoryNames: string[]): Promise<OfferExtraction | null | undefined> {
  if (!isAnthropicConfigured()) return undefined
  try {
    const response = await getAnthropicClient().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: EXTRACTION_SYSTEM_PROMPT(categoryNames),
      messages: [{ role: "user", content: description }],
    })
    const textBlock = response.content.find((block) => block.type === "text")
    const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : ""
    return parseExtraction(raw, categoryNames)
  } catch (error) {
    noteAnthropicFailure(error)
    return undefined
  }
}

/** Turns a provider's free-text offer description into the structured
 * fields Step 2 ("SAJI Understands") shows for confirmation/editing.
 * `data: null` (distinct from `simulated: true`) means at least one provider
 * is configured but every attempt returned something unusable — the caller
 * should fall back to a blank manual form either way. */
export async function extractOfferDetails(description: string, categoryNames: string[]): Promise<OfferExtractionResult> {
  if (!isAnyAiConfigured()) return { simulated: true }

  const geminiResult = await tryGemini(description, categoryNames)
  if (geminiResult !== undefined) return { simulated: false, data: geminiResult }

  const anthropicResult = await tryAnthropic(description, categoryNames)
  if (anthropicResult !== undefined) return { simulated: false, data: anthropicResult }

  if (!isAnyAiConfigured()) return { simulated: true }
  return { simulated: false, data: null }
}
