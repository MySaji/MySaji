import Anthropic from "@anthropic-ai/sdk"
import { Type as GeminiType } from "@google/genai"
import { getGeminiClient } from "@/backend/services/ai/gemini-client"
import { isAnyAiConfigured, isGeminiConfigured, isAnthropicConfigured, noteAnthropicFailure, noteGeminiFailure } from "@/backend/services/ai/credentials"
import { z } from "zod"
import { db } from "@/backend/db"

/**
 * Wizard assistance beyond the Step-2 extraction in offer-extraction.ts:
 * a sharper title, a first-draft description, and tags.
 *
 * Two of the things the brief asks for under "AI assistance" deliberately do
 * NOT go through a model:
 *
 *   - Price suggestion is computed from real comparable offers in the same
 *     category (getCategoryPriceBand below). A model asked to invent a price
 *     produces a confident guess attached to someone's livelihood; the 25th-75th
 *     percentile of what similar providers actually charge is a fact. With too
 *     few comparables the band is withheld rather than estimated.
 *   - Demand is the count of open CustomerRequests in the category
 *     (getCategoryDemandSignal below) — a real number, not a forecast.
 *
 * Image recommendation is answered in lib/offer-image-guidance.ts, which tells
 * a provider which shots to take for their category. SAJI supplies no imagery
 * itself: generating pictures of work that was never done, or pulling in stock,
 * puts something on a listing that a customer reads as the provider's own work.
 * On a marketplace with escrow and disputes that is a trust problem, not a
 * feature.
 *
 * Same Gemini-first, Anthropic-fallback shape as lib/ai/chatbot.ts and
 * offer-extraction.ts — fully real when either key is set, honestly degraded
 * when neither is. The wizard's manual fields always work either way; this
 * only decides whether the provider is offered a suggestion to accept or
 * ignore.
 */

// Opus 5 rather than the Haiku used for Step-2 extraction: extraction is a
// high-volume classification over text the provider already wrote, while this
// writes copy that goes on a public listing. Effort is held low because the
// task is short-form generation, not reasoning.
const ANTHROPIC_MODEL = "claude-opus-5"
const GEMINI_MODEL = "gemini-3.5-flash"

let cachedAnthropicClient: Anthropic | null = null
function getAnthropicClient(): Anthropic {
  if (!cachedAnthropicClient) cachedAnthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return cachedAnthropicClient
}

/* ------------------------------------------------------------------ */
/* Title, description, tags                                            */
/* ------------------------------------------------------------------ */

// Hand-written JSON Schema rather than the SDK's zodOutputFormat helper: that
// helper targets Zod 4, and this project is on Zod 3. The schema below
// constrains what the model may return; the Zod schema after it re-validates
// what actually came back, so a shape change can't reach the wizard unchecked.
const ANTHROPIC_ENHANCEMENT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "A clear, specific listing title. Max 70 characters." },
    description: {
      type: "string",
      description: "2-4 short paragraphs a customer can skim. Plain text, no markdown.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "3-8 short search tags, lowercase.",
    },
  },
  required: ["title", "description", "tags"],
  additionalProperties: false,
} as const

// Same shape, in the Gemini SDK's own Schema type rather than raw JSON
// Schema — Gemini's structured-output support predates general JSON Schema
// passthrough, so the native shape (Type enum, no additionalProperties) is
// the safer bet across SDK versions.
const GEMINI_ENHANCEMENT_SCHEMA = {
  type: GeminiType.OBJECT,
  properties: {
    title: { type: GeminiType.STRING, description: "A clear, specific listing title. Max 70 characters." },
    description: { type: GeminiType.STRING, description: "2-4 short paragraphs a customer can skim. Plain text, no markdown." },
    tags: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING }, description: "3-8 short search tags, lowercase." },
  },
  required: ["title", "description", "tags"],
}

const enhancementSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()),
})

export type OfferEnhancement = z.infer<typeof enhancementSchema>

export type OfferEnhancementResult =
  | { simulated: true }
  | { simulated: false; data: OfferEnhancement }
  | { simulated: false; data: null }

export type EnhancementInput = {
  title: string
  description: string
  categoryName: string | null
  youOffer: string[]
}

const ENHANCEMENT_SYSTEM_PROMPT = `You improve marketplace listings for SAJI, a multi-service marketplace in Kenya.

Rewrite the provider's draft into a clear listing. Rules:
- Stay strictly within what the draft says. Never invent qualifications, certifications, years of experience, guarantees, turnaround times, prices, or areas served.
- Prefer concrete detail the provider gave you over generic marketing language. "Rewiring and fault-finding for homes and small offices" beats "quality electrical solutions you can trust".
- Write for a Kenyan customer. Plain English, no jargon, no hype, no emoji.
- The title names what is being offered, not who the provider is.
- Tags are short search terms a customer would actually type.
- If the draft is too thin to work with, keep the provider's own wording rather than padding it out.`

function buildDraft(input: EnhancementInput): string {
  return [
    `Category: ${input.categoryName ?? "unspecified"}`,
    `Provider's title: ${input.title || "(none yet)"}`,
    `Provider's description: ${input.description || "(none yet)"}`,
    input.youOffer.length > 0 ? `They offer: ${input.youOffer.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

function parseEnhancement(raw: string): OfferEnhancement | null {
  if (!raw) return null
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = enhancementSchema.safeParse(json)
  if (!parsed.success) return null
  return {
    title: parsed.data.title.slice(0, 100),
    description: parsed.data.description,
    tags: parsed.data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
  }
}

/** Returns the enhancement, or undefined to signal "try the other provider". */
async function tryGemini(draft: string): Promise<OfferEnhancement | null | undefined> {
  if (!isGeminiConfigured()) return undefined
  try {
    const response = await getGeminiClient().models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: draft }] }],
      config: {
        systemInstruction: ENHANCEMENT_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: GEMINI_ENHANCEMENT_SCHEMA,
      },
    })
    return parseEnhancement((response.text ?? "").trim())
  } catch (error) {
    noteGeminiFailure(error)
    return undefined
  }
}

/** Returns the enhancement, or undefined to signal total failure. */
async function tryAnthropic(draft: string): Promise<OfferEnhancement | null | undefined> {
  if (!isAnthropicConfigured()) return undefined
  try {
    const response = await getAnthropicClient().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      output_config: {
        format: { type: "json_schema", schema: ANTHROPIC_ENHANCEMENT_SCHEMA as unknown as Record<string, unknown> },
        effort: "low",
      },
      system: ENHANCEMENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: draft }],
    })
    const textBlock = response.content.find((block) => block.type === "text")
    const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : ""
    return parseEnhancement(raw)
  } catch (error) {
    noteAnthropicFailure(error)
    return undefined
  }
}

/**
 * Turns a thin draft into publishable copy. Never invents credentials,
 * guarantees, prices or turnaround times — a listing is a commitment the
 * provider has to honour, and the model has no way to know what they can
 * actually promise.
 *
 * `data: null` (distinct from `simulated: true`) means at least one provider
 * is configured but every attempt failed; either way the caller keeps
 * whatever the provider typed.
 */
export async function enhanceOfferCopy(input: EnhancementInput): Promise<OfferEnhancementResult> {
  if (!isAnyAiConfigured()) return { simulated: true }

  const draft = buildDraft(input)

  const geminiResult = await tryGemini(draft)
  if (geminiResult !== undefined) return { simulated: false, data: geminiResult }

  const anthropicResult = await tryAnthropic(draft)
  if (anthropicResult !== undefined) return { simulated: false, data: anthropicResult }

  if (!isAnyAiConfigured()) return { simulated: true }
  // A failed suggestion must never block the wizard.
  return { simulated: false, data: null }
}

/* ------------------------------------------------------------------ */
/* Price band — grounded in real comparable offers, no model involved   */
/* ------------------------------------------------------------------ */

/** Below this many comparable offers the band is withheld: a "typical range"
 *  drawn from two listings is noise presented as guidance. */
const MIN_COMPARABLES = 5

export type PriceBand =
  | { available: false; reason: "too_few_comparables"; comparables: number }
  | { available: true; low: number; high: number; median: number; currency: string; comparables: number }

/**
 * The 25th-75th percentile of what live offers in the same category actually
 * charge. Computed in SQL over real rows — there is nothing for a model to add
 * here, and a number this load-bearing should not come from one.
 */
export async function getCategoryPriceBand(categoryId: string): Promise<PriceBand> {
  const rows = await db.offer.findMany({
    where: { categoryId, status: "LIVE", price: { not: null } },
    select: { price: true, currency: true },
  })

  const prices = rows
    .map((r) => Number(r.price))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)

  if (prices.length < MIN_COMPARABLES) {
    return { available: false, reason: "too_few_comparables", comparables: prices.length }
  }

  const at = (fraction: number) => prices[Math.min(prices.length - 1, Math.floor(prices.length * fraction))]

  return {
    available: true,
    low: at(0.25),
    median: at(0.5),
    high: at(0.75),
    // Offers are effectively single-currency today; take the commonest rather
    // than assuming, so a stray listing can't mislabel the band.
    currency: mostCommon(rows.map((r) => r.currency)) ?? "KES",
    comparables: prices.length,
  }
}

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>()
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
  let best: string | null = null
  let bestCount = 0
  counts.forEach((count, value) => {
    if (count > bestCount) { best = value; bestCount = count }
  })
  return best
}

/* ------------------------------------------------------------------ */
/* Demand — a count, not a forecast                                    */
/* ------------------------------------------------------------------ */

export type DemandSignal = {
  openRequests: number
  liveOffers: number
  /** Open customer requests per live offer. Higher means less competition. */
  requestsPerOffer: number | null
}

/**
 * What the brief calls "predict demand", answered with facts: how many
 * customers are currently asking for this category, and how many providers
 * are already listed against it.
 */
export async function getCategoryDemandSignal(categoryId: string): Promise<DemandSignal> {
  const [openRequests, liveOffers] = await Promise.all([
    db.customerRequest.count({ where: { categoryId, status: "OPEN" } }),
    db.offer.count({ where: { categoryId, status: "LIVE" } }),
  ])

  return {
    openRequests,
    liveOffers,
    requestsPerOffer: liveOffers > 0 ? Number((openRequests / liveOffers).toFixed(2)) : null,
  }
}
