import { GUIDES } from "@/backend/domain/knowledge"
export const consentKey = "mysaji-analytics-consent-v1"
export const trackedPaths = ["/", "/knowledge", ...GUIDES.map(g => `/knowledge/${g.slug}`)]
export function isTrackedPath(path: string) { return trackedPaths.includes(path) }
declare global { interface Window { dataLayer?: unknown[] } }
export function trackKnowledgeSearch(resultCount: number) {
  if (!isTrackedPath(location.pathname) || location.search || location.hash || !process.env.NEXT_PUBLIC_GTM_ID) return
  try { if (localStorage.getItem(consentKey) !== "granted") return } catch { return }
  window.dataLayer?.push({ event: "search", search_scope: "knowledge", result_count: resultCount })
}
