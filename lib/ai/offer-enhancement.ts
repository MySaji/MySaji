import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { db } from "@/lib/db"

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
 * Image recommendation is not implemented at all: it would mean either
 * generating pictures of work that was never done, or pulling stock imagery
 * into listings customers read as the provider's own. On a marketplace with
 * escrow and disputes that is a trust problem, not a feature.
 *
 * Same env-gated shape as lib/ai/chatbot.ts and offer-extraction.ts — fully
 * real when ANTHROPIC_API_KEY is set, honestly degraded when it isn't. The
 * wizard's manual fields always work either way; this only decides whether the
 * provider is offered a suggestion to accept or ignore.
 */

// Opus 5 rather than the Haiku used for Step-2 extraction: extraction is a
// high-volume classification over text the provider already wrote, while this
// writes copy that goes on a public listing. Effort is held low because the
// task is short-form generation, not reasoning.
const MODEL = "claude-opus-5"

function isConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

let cachedClient: Anthropic | null = null
function getClient(): Anthropic {
  if (!cachedClient) cachedClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return cachedClient
}

/* ------------------------------------------------------------------ */
/* Title, description, tags                                            */
/* ------------------------------------------------------------------ */

// Hand-written JSON Schema rather than the SDK's zodOutputFormat helper: that
// helper targets Zod 4, and this project is on Zod 3. The schema below
// constrains what the model may return; the Zod schema after it re-validates
// what actually came back, so a shape change can't reach the wizard unchecked.
const ENHANCEMENT_JSON_SCHEMA = {
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

/**
 * Turns a thin draft into publishable copy. Never invents credentials,
 * guarantees, prices or turnaround times — a listing is a commitment the
 * provider has to honour, and the model has no way to know what they can
 * actually promise.
 *
 * `data: null` (distinct from `simulated: true`) means the key is configured
 * but the call failed; either way the caller keeps whatever the provider typed.
 */
export async function enhanceOfferCopy(input: EnhancementInput): Promise<OfferEnhancementResult> {
  if (!isConfigured()) return { simulated: true }

  const draft = [
    `Category: ${input.categoryName ?? "unspecified"}`,
    `Provider's title: ${input.title || "(none yet)"}`,
    `Provider's description: ${input.description || "(none yet)"}`,
    input.youOffer.length > 0 ? `They offer: ${input.youOffer.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: {
        format: { type: "json_schema", schema: ENHANCEMENT_JSON_SCHEMA as unknown as Record<string, unknown> },
        effort: "low",
      },
      system: `You improve marketplace listings for SAJI, a multi-service marketplace in Kenya.

Rewrite the provider's draft into a clear listing. Rules:
- Stay strictly within what the draft says. Never invent qualifications, certifications, years of experience, guarantees, turnaround times, prices, or areas served.
- Prefer concrete detail the provider gave you over generic marketing language. "Rewiring and fault-finding for homes and small offices" beats "quality electrical solutions you can trust".
- Write for a Kenyan customer. Plain English, no jargon, no hype, no emoji.
- The title names what is being offered, not who the provider is.
- Tags are short search terms a customer would actually type.
- If the draft is too thin to work with, keep the provider's own wording rather than padding it out.`,
      messages: [{ role: "user", content: draft }],
    })

    const textBlock = response.content.find((block) => block.type === "text")
    const raw = textBlock && "text" in textBlock ? textBlock.text.trim() : ""
    if (!raw) return { simulated: false, data: null }

    const parsed = enhancementSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return { simulated: false, data: null }

    return {
      simulated: false,
      data: {
        title: parsed.data.title.slice(0, 100),
        description: parsed.data.description,
        tags: parsed.data.tags.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
      },
    }
  } catch {
    // A failed suggestion must never block the wizard.
    return { simulated: false, data: null }
  }
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
