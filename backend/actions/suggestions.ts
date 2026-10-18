"use server"

import { z } from "zod"
import { auth } from "@/backend/auth"
import { getMyLocationOrigin } from "@/backend/actions/geo"
import {
  buildSuggestions, type Suggestion, type SuggestionKind,
} from "@/backend/services/suggestions"

/**
 * The customer's own feed.
 *
 * Signed out there is nothing to personalise, and guessing from an IP would
 * produce a page about nobody. The home page falls back to its ordinary
 * browse sections in that case rather than showing a feed that pretends to
 * know them.
 */

export type HomeSuggestions = {
  items: Suggestion[]
  /** False when there is nothing of theirs to go on yet. */
  personalised: boolean
} | null

export async function getHomeSuggestions(input?: unknown): Promise<HomeSuggestions> {
  const parsed = z.object({ limit: z.number().int().min(1).max(24).optional() }).safeParse(input ?? {})
  const limit = (parsed.success ? parsed.data.limit : undefined) ?? 10

  const session = await auth()
  if (!session?.user?.id) return null

  const origin = await getMyLocationOrigin().catch(() => null)
  const items = await buildSuggestions({ userId: session.user.id, origin, limit })
  if (items.length === 0) return null

  // "Popular" is the only thing shown to somebody who has done nothing yet,
  // so a feed made only of it is not personalised and should not claim to be.
  const personalised = items.some((i) => i.kind !== "POPULAR_LOCAL")
  return { items, personalised }
}

/**
 * The same engine, pointed at finding something new.
 *
 * Explore is where somebody goes when they do not already know what they
 * want. Showing them the thing they buy every month is the one answer they
 * definitely did not come for, so the habit-shaped cards are left out and
 * what remains is saved items, things they looked at, shops near them and
 * what is selling locally.
 *
 * Deliberately NOT a second ranking engine. One place decides what a signal
 * is worth, and the surface decides which signals it wants.
 */
const NOT_ON_EXPLORE: SuggestionKind[] = ["DUE_AGAIN", "REORDER", "GOES_WITH"]

export async function getExploreSuggestions(input?: unknown): Promise<HomeSuggestions> {
  const parsed = z.object({ limit: z.number().int().min(1).max(24).optional() }).safeParse(input ?? {})
  const limit = (parsed.success ? parsed.data.limit : undefined) ?? 12

  const session = await auth()
  if (!session?.user?.id) return null

  const origin = await getMyLocationOrigin().catch(() => null)
  const items = await buildSuggestions({
    userId: session.user.id, origin, limit, exclude: NOT_ON_EXPLORE,
  })
  if (items.length === 0) return null

  const personalised = items.some((i) => i.kind !== "POPULAR_LOCAL")
  return { items, personalised }
}
