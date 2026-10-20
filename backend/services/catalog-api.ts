/**
 * Client for the Python catalog API (MySaji/mysaji-backend).
 *
 * Server-side only. On the VPS the app reaches the API over the private Docker
 * network (SAJI_API_URL=http://api:8000); where SAJI_API_URL is unset, as on
 * Vercel today, callers keep their existing Prisma query. Every function
 * returns null instead of throwing, so an API outage falls back to Prisma
 * rather than breaking a page.
 */

type Page<T> = { next: string | null; results: T[] }

export type ApiCategory = {
  id: string
  name: string
  slug: string
  type: "PRODUCT" | "SERVICE"
  icon: string | null
  parent_id: string | null
  tier: string | null
}

const MAX_PAGES = 20

function apiBase(): string | null {
  const base = process.env.SAJI_API_URL?.trim()
  return base ? base.replace(/\/+$/, "") : null
}

async function getAll<T>(path: string): Promise<T[] | null> {
  const base = apiBase()
  if (!base) return null
  const results: T[] = []
  let url: string | null = `${base}${path}`
  try {
    for (let page = 0; url && page < MAX_PAGES; page += 1) {
      const response: Response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error(`Catalog API ${response.status}`)
      const body = (await response.json()) as Page<T>
      results.push(...body.results)
      // DRF builds `next` from the request's host; keep following it on our base.
      url = body.next ? `${base}${new URL(body.next).pathname}${new URL(body.next).search}` : null
    }
    return url ? null : results
  } catch (error) {
    console.error("Catalog API unavailable; using the database directly", (error as Error).message)
    return null
  }
}

/** Active categories of one type, ordered by name, or null when the API is not in use or failed. */
export async function fetchCategories(type: "PRODUCT" | "SERVICE"): Promise<ApiCategory[] | null> {
  return getAll<ApiCategory>(`/api/v1/categories?type=${type}&page_size=100`)
}
