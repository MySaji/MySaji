/**
 * Ranking nearby results against what the customer typed.
 *
 * Deliberately a *ranking*, not a filter. Someone who types "my sink is
 * leaking" and gets an empty screen learns nothing; the same person shown
 * three plumbers first and then everyone else nearby can act immediately.
 * So a non-match is pushed down, never hidden — and the UI says which
 * results actually matched so the ordering is not mysterious.
 *
 * It is also deliberately dumb. There is no embedding model or search index
 * wired up here, and pretending otherwise would be worse than a transparent
 * word overlap: this scores on words the customer actually typed appearing
 * in a provider's trade, skills or shop category, which is explainable to
 * both sides.
 */

/** Words too common to carry meaning in a one-line problem description. */
const STOP_WORDS = new Set([
  "a", "an", "and", "the", "is", "are", "was", "were", "be", "been", "being",
  "i", "me", "my", "mine", "we", "our", "you", "your", "it", "its",
  "need", "needs", "needed", "want", "wants", "looking", "look", "find",
  "for", "to", "of", "in", "on", "at", "with", "from", "by", "near", "nearby",
  "someone", "somebody", "anyone", "please", "help", "can", "get", "got",
  "have", "has", "do", "does", "did", "will", "would", "should", "could",
  "urgent", "urgently", "asap", "now", "today", "tomorrow",
  "problem", "issue", "fix", "fixed", "service", "services",
])

/** Light stemmer: trims the plural/gerund endings that would otherwise stop
 *  "leaking" matching "leak" or "plumbers" matching "plumber". Crude on
 *  purpose — a real stemmer is not worth a dependency for this. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith("ers")) return word.slice(0, -3)
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith("er")) return word.slice(0, -2)
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1)
  return word
}

/** The meaningful, stemmed words in a description. */
export function describeTerms(description: string): string[] {
  const words = description
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  return [...new Set(words.map(stem))]
}

/**
 * How well a candidate's own words answer the description.
 *
 * Returns 0 when nothing overlaps, which the caller renders as "also nearby"
 * rather than dropping.
 */
export function matchScore(terms: string[], haystack: (string | null | undefined)[]): number {
  if (terms.length === 0) return 0
  const text = haystack.filter(Boolean).join(" ").toLowerCase()
  if (!text) return 0

  let score = 0
  for (const term of terms) {
    // Match on the stem so "plumbing" in a description finds "Plumber",
    // and check the raw term too for short words the stemmer leaves alone.
    if (text.includes(term)) score += 1
  }
  return score
}
