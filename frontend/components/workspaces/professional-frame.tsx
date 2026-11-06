"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Pin, Search, ListChecks, X, ChevronRight } from "lucide-react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { Input } from "@/frontend/components/ui/input"
import {
  workspaceScope,
  safeWorkspaceHref,
  permittedSavedLinks,
  readPersonalTasks,
  eastAfricaDay,
  validDay,
  type WorkspaceLink,
  type PersonalTask,
} from "@/backend/domain/workspace-personalization"

type SavedState = { key: string; pins: string[]; recent: string[]; tasks: PersonalTask[]; compact: boolean }
const empty = (key: string): SavedState => ({ key, pins: [], recent: [], tasks: [], compact: false })
export function ProfessionalFrame({ children }: { children: ReactNode }) {
  const path = usePathname(),
    { user } = useAuthContext(),
    scope = workspaceScope(path, user?.role)
  const isConversation = path.endsWith("/messages")
  const key =
    user && scope
      ? `saji:workbench:${user.id}:${user.role}:${scope === "provider" || scope === "shopkeeper" ? "pro" : scope}`
      : ""
  const [store, setStore] = useState<SavedState | null>(null),
    [links, setLinks] = useState<WorkspaceLink[]>([])
  const [open, setOpen] = useState(false),
    [view, setView] = useState("pages"),
    [query, setQuery] = useState("")
  const [taskTitle, setTaskTitle] = useState(""),
    [due, setDue] = useState(""),
    [taskFilter, setTaskFilter] = useState("open")
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [clearAsk, setClearAsk] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  const current = store?.key === key ? store : null
  useEffect(() => {
    if (!key) return
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null")
      setStore({
        ...empty(key),
        pins: Array.isArray(saved?.pins)
          ? saved.pins.filter((v: unknown) => typeof v === "string").slice(0, 12)
          : [],
        recent: Array.isArray(saved?.recent)
          ? saved.recent.filter((v: unknown) => typeof v === "string").slice(0, 8)
          : [],
        tasks: readPersonalTasks(saved?.tasks),
        compact: saved?.compact === true,
      })
    } catch {
      setStore(empty(key))
    }
  }, [key])
  useEffect(() => {
    if (!scope) return
    const root = frame.current?.closest("[data-workspace]")
    if (!root) return
    let timer: ReturnType<typeof setTimeout>
    const collect = () => {
      const found = new Map<string, string>()
      root.querySelectorAll<HTMLElement>("[data-workspace-navigation] a[href]").forEach((node) => {
        const raw = node.getAttribute("href")
        if (raw?.includes("?")) return // Save canonical sections, not record searches or tab queries.
        const href = safeWorkspaceHref(raw, scope),
          label = (node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80)
        if (href && label) found.set(href, label)
      })
      const next = [...found].map(([href, label]) => ({ href, label }))
      setLinks((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
    }
    collect()
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(collect, 80)
    })
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [scope, key, isConversation])
  const section = [...links]
    .sort((a, b) => b.href.length - a.href.length)
    .find((link) => path === link.href || path.startsWith(link.href + "/"))
  const write = (next: SavedState) => {
    if (!key || next.key !== key) return
    setStore(next)
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ pins: next.pins, recent: next.recent, tasks: next.tasks, compact: next.compact })
      )
    } catch {
      setError("Browser storage is unavailable. Changes stay in this open workspace only.")
    }
  }
  useEffect(() => {
    if (!current || !section || current.recent[0] === section.href) return
    const next = {
      ...current,
      recent: [section.href, ...current.recent.filter((href) => href !== section.href)].slice(0, 8),
    }
    setStore(next)
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ pins: next.pins, recent: next.recent, tasks: next.tasks, compact: next.compact })
      )
    } catch {
      /* Navigation remains available without storage. */
    }
  }, [key, current, section])
  useEffect(() => {
    setOpen(false)
    setNotice("")
    setError("")
    setQuery("")
  }, [path, key])
  useEffect(() => { setTaskTitle(""); setDue(""); setClearAsk(false); setTaskFilter("open") }, [key])
  if (!scope || isConversation) return <>{children}</>
  const pinned = permittedSavedLinks(current?.pins, links),
    recent = permittedSavedLinks(current?.recent, links)
  const togglePin = (href: string) => {
    if (!current || !links.some((link) => link.href === href)) return
    const exists = current.pins.includes(href)
    if (!exists && pinned.length >= 12) {
      setError("Keep up to 12 pinned pages. Unpin one to add another.")
      return
    }
    write({
      ...current,
      pins: exists
        ? current.pins.filter((item) => item !== href)
        : [...pinned.map((link) => link.href), href],
    })
  }
  const tasks = current?.tasks ?? [],
    today = eastAfricaDay(),
    openTasks = tasks.filter((task) => !task.done),
    overdue = openTasks.filter((task) => task.due && task.due < today)
  const visibleTasks = tasks
    .filter((task) =>
      taskFilter === "all" || taskFilter === "done"
        ? taskFilter === "all" || task.done
        : taskFilter === "overdue"
          ? !task.done && !!task.due && task.due < today
          : !task.done
    )
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.due || "9999").localeCompare(b.due || "9999"))
  const action =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium disabled:opacity-50"
  return (
    <div
      ref={frame}
      className="professional-frame"
      data-density={current?.compact ? "compact" : "comfortable"}
    >
      <div className="professional-context">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0 font-semibold text-primary">
            {scope === "provider" || scope === "shopkeeper"
              ? "Saji Pro"
              : scope === "sub-admin"
                ? "Operations"
                : scope.charAt(0).toUpperCase() + scope.slice(1)}
          </span>
          <ChevronRight size={14} />
          <span className="truncate">{section?.label || "Workspace"}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {section && (
            <button
              type="button"
              disabled={!current}
              className={action}
              aria-pressed={pinned.some((link) => link.href === section.href)}
              onClick={() => togglePin(section.href)}
            >
              <Pin size={14} />
              {pinned.some((link) => link.href === section.href) ? "Pinned" : "Pin page"}
            </button>
          )}
          <button
            type="button"
            className={action}
            onClick={() => {
              setView("pages")
              setOpen(true)
            }}
          >
            <Search size={14} />
            My workspace
          </button>
          <button
            type="button"
            className={action}
            onClick={() => {
              setView("plan")
              setOpen(true)
            }}
          >
            <ListChecks size={15} />
            My work plan{openTasks.length ? ` (${openTasks.length})` : ""}
          </button>
        </div>
      </div>
      {pinned.length > 0 && (
        <nav aria-label="Pinned workspace pages" className="professional-pins">
          {pinned.map((link) => (
            <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="professional-content">{children}</div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>{view === "plan" ? "Your personal work plan" : "Your workspace"}</DialogTitle>
          <DialogDescription>
            {view === "plan"
              ? "A personal checklist saved on this browser for this account. Completing it does not update a case, booking, payment or staff assignment."
              : "Pin the pages available in your navigation and return to recently used sections."}
          </DialogDescription>
          <div className="flex flex-wrap gap-2">
            <button className={action} aria-pressed={view === "pages"} onClick={() => setView("pages")}>
              Saved pages
            </button>
            <button className={action} aria-pressed={view === "plan"} onClick={() => setView("plan")}>
              Work plan
            </button>
            {current && (
              <button
                className={`${action} ml-auto`}
                aria-pressed={current.compact}
                onClick={() => write({ ...current, compact: !current.compact })}
              >
                {current.compact ? "Compact spacing" : "Comfortable spacing"}
              </button>
            )}
          </div>
          {view === "pages" ? (
            <div className="space-y-5">
              <Input
                aria-label="Search available workspace pages"
                placeholder="Search your available pages"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {!query && recent.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Recently used sections
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {recent.slice(0, 5).map((link) => (
                      <Link key={link.href} href={link.href} className={action}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              <div className="max-h-[42dvh] space-y-2 overflow-y-auto">
                {links
                  .filter((link) => link.label.toLowerCase().includes(query.toLowerCase()))
                  .map((link) => (
                    <div key={link.href} className="flex min-w-0 items-center gap-2 rounded-xl border p-2">
                      <Link
                        href={link.href}
                        className="min-w-0 flex-1 break-words px-2 py-2 text-sm font-medium"
                      >
                        {link.label}
                      </Link>
                      <button
                        className={action}
                        disabled={!current}
                        aria-label={`Pin ${link.label}`}
                        aria-pressed={pinned.some((p) => p.href === link.href)}
                        onClick={() => togglePin(link.href)}
                      >
                        <Pin size={15} />
                        {pinned.some((p) => p.href === link.href) ? "Pinned" : "Pin"}
                      </button>
                    </div>
                  ))}
                {!links.length && (
                  <p className="p-4 text-sm text-muted-foreground">
                    Pages appear when your workspace navigation is ready.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted p-3 text-center text-xs">
                <span>
                  <strong className="block text-lg">{openTasks.length}</strong>Open
                </span>
                <span>
                  <strong className="block text-lg">{overdue.length}</strong>Overdue
                </span>
                <span>
                  <strong className="block text-lg">{tasks.filter((task) => task.done).length}</strong>Done
                </span>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!current || !taskTitle.trim() || (due && !validDay(due))) return
                  if (tasks.length >= 50) {
                    setError("Keep up to 50 personal tasks. Remove completed tasks to make space.")
                    return
                  }
                  write({
                    ...current,
                    tasks: [
                      ...tasks,
                      {
                        id: crypto.randomUUID(),
                        title: taskTitle.trim().slice(0, 160),
                        due,
                        done: false,
                        createdAt: new Date().toISOString(),
                      },
                    ],
                  })
                  setTaskTitle("")
                  setDue("")
                  setError("")
                }}
                className="space-y-3"
              >
                <label className="block text-sm font-medium">
                  Task title
                  <Input
                    aria-label="Personal task title"
                    maxLength={160}
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                    placeholder="A clear next step"
                    disabled={!current}
                  />
                </label>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="min-w-0 flex-1 text-xs">
                    Due date (optional, East Africa Time)
                    <Input
                      aria-label="Personal task due date"
                      type="date"
                      value={due}
                      onChange={(event) => setDue(event.target.value)}
                    />
                  </label>
                  <button
                    disabled={!current || !taskTitle.trim()}
                    className={`${action} bg-primary text-primary-foreground`}
                  >
                    Add task
                  </button>
                </div>
              </form>
              <div className="flex flex-wrap gap-2">
                {["open", "overdue", "done", "all"].map((filter) => (
                  <button
                    key={filter}
                    className={action}
                    aria-pressed={taskFilter === filter}
                    onClick={() => setTaskFilter(filter)}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
              <div className="max-h-[32dvh] space-y-2 overflow-y-auto">
                {visibleTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-3 rounded-xl border p-3">
                    <input
                      type="checkbox"
                      checked={task.done}
                      aria-label={`Complete ${task.title}`}
                      className="mt-1 h-5 w-5 shrink-0"
                      onChange={() =>
                        current &&
                        write({
                          ...current,
                          tasks: tasks.map((item) =>
                            item.id === task.id ? { ...item, done: !item.done } : item
                          ),
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`break-words text-sm ${task.done ? "text-muted-foreground line-through" : "font-medium"}`}
                      >
                        {task.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {task.due
                          ? `${task.due}${!task.done && task.due < today ? " / Overdue" : ""}`
                          : "No due date"}
                      </p>
                    </div>
                    <button
                      className={action}
                      aria-label={`Remove task ${task.title}`}
                      onClick={() =>
                        current && write({ ...current, tasks: tasks.filter((item) => item.id !== task.id) })
                      }
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
                {!visibleTasks.length && (
                  <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                    No tasks in this view. Add a next step or choose another filter.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={!openTasks.length}
                  className={action}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        openTasks
                          .map((task) => `[ ] ${task.title}${task.due ? ` / Due ${task.due}` : ""}`)
                          .join("\n")
                      )
                      setNotice("Open task list copied.")
                    } catch {
                      setError("Copy is unavailable on this device.")
                    }
                  }}
                >
                  Copy open task list
                </button>
                <button
                  disabled={!tasks.some((task) => task.done)}
                  className={action}
                  onClick={() => setClearAsk(true)}
                >
                  Clear completed
                </button>
              </div>
              {clearAsk && (
                <div className="space-y-3 rounded-xl border p-4 text-sm">
                  <p>Remove completed tasks from this browser's plan?</p>
                  <div className="flex gap-2">
                    <button className={action} onClick={() => setClearAsk(false)}>
                      Keep tasks
                    </button>
                    <button
                      className={action}
                      onClick={() => {
                        if (current) write({ ...current, tasks: tasks.filter((task) => !task.done) })
                        setClearAsk(false)
                      }}
                    >
                      Remove completed tasks
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {notice && (
            <p role="status" className="text-sm text-primary">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
