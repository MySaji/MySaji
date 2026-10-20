type SearchableRequest = { title: string; description: string; categoryName: string; location: string; createdAt: string }
type CustomerRequest = SearchableRequest & { status: string; responseCount: number }
type BoardRequest = SearchableRequest & { myResponse: unknown; distanceKm: number | null; budgetMax: number | null }
const matches = (item: SearchableRequest, query: string) => `${item.title} ${item.description} ${item.categoryName} ${item.location}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

export function discoverCustomerRequests<T extends CustomerRequest>(items: T[], query: string, status: string, sort: string): T[] {
  return items.filter(item => matches(item, query) && (status === "ALL" || (status === "REPLIES" ? item.status === "OPEN" && item.responseCount > 0 : item.status === status))).sort((a, b) => {
    if (sort === "responses") return b.responseCount - a.responseCount || Date.parse(b.createdAt) - Date.parse(a.createdAt)
    return sort === "oldest" ? Date.parse(a.createdAt) - Date.parse(b.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })
}

export function discoverBoardRequests<T extends BoardRequest>(items: T[], query: string, status: string, category: string, sort: string): T[] {
  return items.filter(item => matches(item, query) && (category === "ALL" || item.categoryName === category) && (status === "ALL" || (status === "UNANSWERED" ? !item.myResponse : !!item.myResponse))).sort((a, b) => {
    if (sort === "nearest") return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || Date.parse(b.createdAt) - Date.parse(a.createdAt)
    if (sort === "budget") return (b.budgetMax ?? -1) - (a.budgetMax ?? -1) || Date.parse(b.createdAt) - Date.parse(a.createdAt)
    return Date.parse(b.createdAt) - Date.parse(a.createdAt)
  })
}
