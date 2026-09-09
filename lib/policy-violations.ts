/**
 * Detects messages that try to take a job off Saji.
 *
 * This is the revenue-protection counterpart to lib/contact-info-filter.ts.
 * That file *masks* a phone number so it cannot be read; this one *records
 * that someone tried*, which is what lets a pattern across many conversations
 * become visible to an admin. Masking alone loses that signal entirely — the
 * message is cleaned and nobody ever learns the provider asks every customer
 * for their number.
 *
 * Deliberately advisory, never blocking. Every rule here is a keyword
 * heuristic: "cash" appears in honest messages about how a customer wants to
 * pay on completion, and "call me" is often about a booked visit. Refusing to
 * deliver a message on that basis would break real conversations and teach
 * people to phrase around it. So a flagged message still sends; what changes
 * is that an admin can see it.
 *
 * Detection runs on the ORIGINAL text, before masking. Once maskContactInfo
 * has replaced a number with bullets there is nothing left to detect, so
 * order matters at the call site.
 */

export type ViolationKind = "CONTACT_DETAILS" | "OFF_PLATFORM_PAYMENT" | "PRICE_MANIPULATION"
export type ViolationSeverity = "LOW" | "MEDIUM" | "HIGH"

export type DetectedViolation = {
  kind: ViolationKind
  severity: ViolationSeverity
  /** The fragment that matched, so an admin sees the basis for the flag
   *  without the whole private conversation being copied into the queue. */
  excerpt: string
}

type Rule = {
  kind: ViolationKind
  severity: ViolationSeverity
  pattern: RegExp
}

/** Word-boundary anchored so "whatsapp" doesn't fire on "what", and phrased
 *  around intent ("send me your number") rather than bare nouns ("number"),
 *  which appear constantly in legitimate messages about job numbers, house
 *  numbers and quantities. */
const RULES: Rule[] = [
  // Asking to move the conversation to a personal channel.
  {
    kind: "CONTACT_DETAILS",
    severity: "HIGH",
    pattern: /\b(?:send|give|share|text|drop)\s+(?:me\s+)?(?:your|ur)\s+(?:number|digits|contact|phone|whatsapp|email)\b/i,
  },
  {
    kind: "CONTACT_DETAILS",
    severity: "HIGH",
    pattern: /\b(?:reach|call|text|message|dm|ping)\s+me\s+(?:on|at|via|through)\b/i,
  },
  {
    kind: "CONTACT_DETAILS",
    severity: "MEDIUM",
    pattern: /\b(?:whatsapp|telegram|signal|instagram|facebook)\s+(?:me|number|instead)\b/i,
  },

  // Steering the payment off the platform, which is the actual revenue leak.
  {
    kind: "OFF_PLATFORM_PAYMENT",
    severity: "HIGH",
    // "book/hire me directly" is the same steer as "pay me directly" — the
    // booking is where the commission is, so bypassing it is the leak.
    pattern: /\b(?:pay|paying|payment|book|booking|hire|deal)\s+(?:me\s+|us\s+|with\s+me\s+)?(?:directly|direct|outside|off)\b/i,
  },
  {
    kind: "OFF_PLATFORM_PAYMENT",
    severity: "HIGH",
    pattern: /\b(?:outside|off|avoid|skip|bypass|without)\s+(?:the\s+)?(?:app|platform|saji|system)\b/i,
  },
  {
    kind: "OFF_PLATFORM_PAYMENT",
    severity: "MEDIUM",
    pattern: /\b(?:cash|mpesa|m-pesa)\s+(?:only|directly|to\s+me|instead)\b/i,
  },
  {
    kind: "OFF_PLATFORM_PAYMENT",
    severity: "MEDIUM",
    pattern: /\b(?:don'?t|do\s+not|no\s+need\s+to)\s+(?:book|pay|order)\s+(?:it\s+)?(?:here|through|on)\b/i,
  },

  // Pressing for money beyond the agreed, booked price.
  {
    kind: "PRICE_MANIPULATION",
    severity: "MEDIUM",
    pattern: /\b(?:extra|additional|top\s*up|add)\s+(?:\d[\d,]*|payment|charge|fee|money|cash)\b/i,
  },
  {
    kind: "PRICE_MANIPULATION",
    severity: "MEDIUM",
    pattern: /\b(?:cheaper|less|discount|better\s+price)\s+(?:if|when)\s+(?:you|we)\b/i,
  },
]

/** Trimmed so one long message cannot push an unbounded string into the
 *  admin queue, with a little context either side of the match. */
const EXCERPT_PADDING = 24
const MAX_EXCERPT = 160

export function detectViolations(text: string): DetectedViolation[] {
  if (!text.trim()) return []

  const found: DetectedViolation[] = []
  const seen = new Set<ViolationKind>()

  for (const rule of RULES) {
    const match = rule.pattern.exec(text)
    if (!match) continue
    // One flag per kind per message: three phrasings of "pay me directly" in
    // one message is one attempt, not three offences.
    if (seen.has(rule.kind)) continue
    seen.add(rule.kind)

    const start = Math.max(0, match.index - EXCERPT_PADDING)
    const end = Math.min(text.length, match.index + match[0].length + EXCERPT_PADDING)
    const excerpt = (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "")

    found.push({ kind: rule.kind, severity: rule.severity, excerpt: excerpt.slice(0, MAX_EXCERPT) })
  }

  return found
}
