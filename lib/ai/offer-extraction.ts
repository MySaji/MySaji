import Anthropic from "@anthropic-ai/sdk"
import { isConfigured, noteAnthropicFailure } from "@/lib/ai/credentials"
import { z } from "zod"

const MODEL = "claude-haiku-4-5"

// Same env-gated pattern as lib/ai/chatbot.ts (and every other paid
// third-party integration in this project) — fully real when
// ANTHROPIC_API_KEY is set, honestly degraded when it isn't. The wizard's
// Step 2 always shows a real, editable manual form either way; this only
// decides whether that form starts pre-filled or blank.


let cachedClient: Anthropic | null = null
function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return cachedClient
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

/** Turns a provider's free-text offer description into the structured
 * fields Step 2 ("SAJI Understands") shows for confirmation/editing. Never
 * invents a category outside the real list passed in — the model is told
 * the exact category names that exist and must either pick one verbatim or
 * return null, so a bad guess can't silently create a mismatched offer.
 * `data: null` (distinct from `simulated: true`) means the API is
 * configured but the call itself failed or returned something unusable —
 * the caller should fall back to a blank manual form either way. */
export async function extractOfferDetails(description: string, categoryNames: string[]): Promise<OfferExtractionResult> {
  if (!isConfigured()) return { simulated: true }

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 500,
      system: `You extract structured listing details from a marketplace provider's free-text description of what they offer, for the SAJI multi-service marketplace (Kenya).

Respond with ONLY a single JSON object, no markdown fences, no other text, matching exactly this shape:
{"title": string|null, "categoryName": string|null, "youOffer": string[], "youServe": string[], "fulfilment": string[], "location": string|null}

Rules:
- "title": a short, natural listing title (e.g. "Cement & Steel Supply"), or null if you can't tell.
- "categoryName": must be EXACTLY one of these existing category names, copied verbatim, or null if none genuinely fit: ${categoryNames.join(", ")}
- "youOffer": short tags for the specific items/services offered (max 8), e.g. ["Cement","Steel"].
- "youServe": who the customer is (max 5), e.g. ["Contractors","Businesses"]. Empty array if unclear.
- "fulfilment": subset of exactly these values: DELIVERY, PICKUP, PROVIDER_SITE_VISIT, SHIPPING, REMOTE. Only include ones clearly implied by the text.
- "location": a place name mentioned in the text, or null if none.
- Never invent details not implied by the text.`,
      messages: [{ role: "user", content: description }],
    })
    const textBlock = response.content.find((block) => block.type === "text")
    const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : ""
    // Claude occasionally wraps JSON in ```json fences despite instructions
    // not to — strip them rather than failing the whole extraction over it.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim()

    let json: unknown
    try {
      json = JSON.parse(cleaned)
    } catch (error) {
    // A rejected key reports as "not configured" rather than a failed call,
    // so the wizard shows the same honest state it shows with no key at all.
    if (noteAnthropicFailure(error)) return { simulated: true }
      return { simulated: false, data: null }
    }

    const parsed = extractionResultSchema.safeParse(json)
    if (!parsed.success) return { simulated: false, data: null }
    // A category name the model returned that isn't actually in our real
    // list is worse than no guess at all — silently drop it rather than
    // let a hallucinated category slip through to the confirm screen.
    if (parsed.data.categoryName && !categoryNames.includes(parsed.data.categoryName)) {
      return { simulated: false, data: { ...parsed.data, categoryName: null } }
    }
    return { simulated: false, data: parsed.data }
  } catch {
    return { simulated: false, data: null }
  }
}
