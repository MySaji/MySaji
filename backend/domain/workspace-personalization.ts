export type WorkspaceLink = { href: string; label: string }
export type PersonalTask = { id: string; title: string; due: string; done: boolean; createdAt: string }
export const WORKSPACE_ROOTS = [
  "provider",
  "shopkeeper",
  "admin",
  "sub-admin",
  "secretary",
  "agent",
  "distributor",
] as const
export type WorkspaceRoot = (typeof WORKSPACE_ROOTS)[number]
export function workspaceScope(path: string, role: string | undefined): WorkspaceRoot | null {
  const root = path.split("/")[1] as WorkspaceRoot
  if (!WORKSPACE_ROOTS.includes(root)) return null
  if (root === "provider" || root === "shopkeeper")
    return role === "provider" || role === "shopkeeper" ? root : null
  return root === role ? root : null
}
export function safeWorkspaceHref(value: unknown, root: WorkspaceRoot): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.length > 300
  )
    return null
  const path = value.split(/[?#]/)[0]
  if (/[\u0000-\u0020%]/.test(path) || path.split("/").some((part) => part === "." || part === ".."))
    return null
  const roots = root === "provider" || root === "shopkeeper" ? ["provider", "shopkeeper"] : [root]
  if (!roots.some((r) => path === `/${r}` || path.startsWith(`/${r}/`))) return null
  if (root === "admin" && (path === "/admin/wallet" || path.startsWith("/admin/wallet/"))) return null
  return path
}
export function permittedSavedLinks(value: unknown, allowed: WorkspaceLink[]): WorkspaceLink[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === "string"))]
    .slice(0, 12)
    .flatMap((href) => {
      const link = allowed.find((item) => item.href === href)
      return link ? [link] : []
    })
}
export function validDay(day: unknown): day is string {
  return (
    typeof day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(new Date(day + "T00:00:00Z").getTime()) &&
    new Date(day + "T00:00:00Z").toISOString().slice(0, 10) === day
  )
}
export function readPersonalTasks(value: unknown): PersonalTask[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.slice(0, 50).flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !item.id ||
      item.id.length > 80 ||
      ids.has(item.id) ||
      typeof item.title !== "string" ||
      !item.title.trim() ||
      item.title.length > 160 ||
      typeof item.done !== "boolean" ||
      typeof item.createdAt !== "string" ||
      !Number.isFinite(Date.parse(item.createdAt)) ||
      (item.due !== "" && !validDay(item.due))
    )
      return []
    ids.add(item.id)
    return [
      { id: item.id, title: item.title.trim(), done: item.done, due: item.due, createdAt: item.createdAt },
    ]
  })
}
export function eastAfricaDay(now = Date.now()): string {
  return new Date(now + 10_800_000).toISOString().slice(0, 10)
}
export function activityDateRange(from: string, to: string) {
  if (!validDay(from) || !validDay(to) || from > to) return null
  const start = new Date(from + "T00:00:00+03:00"),
    end = new Date(new Date(to + "T00:00:00+03:00").getTime() + 86_400_000)
  return end.getTime() - start.getTime() > 366 * 86_400_000 ? null : { start, end }
}
