import { getPosOfflineContext } from "@/backend/actions/pos-offline-context"

export type OfflineScope = { userId: string; shopId: string }
export const ACTIVE_POS_USER = "saji-pos-active-user"
let current: OfflineScope | null = null

export function offlineScope(): OfflineScope | null {
  if (typeof window === "undefined" || !current) return null
  return localStorage.getItem(ACTIVE_POS_USER) === current.userId ? current : null
}

export async function initializeOfflineScope(userId: string): Promise<OfflineScope | null> {
  let scope: OfflineScope | null
  try {
    scope = await getPosOfflineContext()
    if (!scope || scope.userId !== userId) { current = null; return null }
    localStorage.setItem(`saji-pos-scope:${userId}`, JSON.stringify(scope))
  } catch {
    try { scope = JSON.parse(localStorage.getItem(`saji-pos-scope:${userId}`) || "null") } catch { scope = null }
    if (!scope || scope.userId !== userId || typeof scope.shopId !== "string") return null
    // Offline restoration is permitted only for the last explicitly active account.
    if (localStorage.getItem(ACTIVE_POS_USER) !== userId) return null
  }
  current = scope
  localStorage.setItem(ACTIVE_POS_USER, userId)
  return scope
}

export function suspendOfflineScope() {
  current = null
  if (typeof window !== "undefined") localStorage.removeItem(ACTIVE_POS_USER)
}
