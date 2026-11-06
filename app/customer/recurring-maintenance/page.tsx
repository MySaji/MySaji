"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { CalendarDays, RefreshCw, CheckCircle2 } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/frontend/components/ui/dialog"
import {
  getMyRecurringMaintenance,
  markMaintenanceServiced,
  deactivateRecurringMaintenance,
  type RecurringMaintenanceItem,
} from "@/backend/actions/recurring-maintenance"

export default function RecurringMaintenancePage() {
  const [items, setItems] = useState<RecurringMaintenanceItem[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("")
  const [query, setQuery] = useState(""),
    [view, setView] = useState("all")
  const [target, setTarget] = useState<{
      item: RecurringMaintenanceItem
      action: "serviced" | "remove"
    } | null>(null),
    [busy, setBusy] = useState(false),
    lock = useRef(false)
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await getMyRecurringMaintenance())
      setError("")
    } catch {
      setError("Maintenance reminders could not load. Please retry.")
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const act = async () => {
    if (!target || lock.current) return
    lock.current = true
    setBusy(true)
    setError("")
    try {
      const result =
        target.action === "serviced"
          ? await markMaintenanceServiced({ id: target.item.id })
          : await deactivateRecurringMaintenance({ id: target.item.id })
      if (!result.success) {
        setError(result.error)
        return
      }
      setNotice(
        target.action === "serviced"
          ? "Service recorded and the next reminder updated. No new booking or payment was created."
          : "The recurring reminder was removed. Previous jobs are unchanged."
      )
      setTarget(null)
      await load()
    } catch {
      setError("The change could not be confirmed. Refresh before retrying.")
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  const visible = items
    .filter(
      (item) =>
        (view === "all" || (view === "due" && item.isDue) || (view === "upcoming" && !item.isDue)) &&
        `${item.title} ${item.providerName ?? ""}`.toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => Date.parse(a.nextDueAt) - Date.parse(b.nextDueAt))
  const date = (value: string) =>
    new Date(value).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium" })
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="customer-surface border-t-4 border-t-primary">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          A little planning goes a long way
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Keep your home running smoothly</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          Track repeating maintenance and choose when to book again. Reminders do not automatically book a
          provider or charge you.
        </p>
        <Link
          href="/customer/jobs"
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium text-primary"
        >
          Add a reminder from a completed job
        </Link>
      </header>
      <section aria-label="Maintenance summary" className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Active reminders", count: items.length },
          { label: "May be due", count: items.filter((item) => item.isDue).length },
          { label: "Upcoming", count: items.filter((item) => !item.isDue).length },
        ].map((metric) => (
          <div key={metric.label} className="customer-surface">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <strong className="mt-3 block text-2xl">{loading ? "..." : metric.count}</strong>
          </div>
        ))}
      </section>
      <section aria-label="Filter maintenance reminders" className="customer-surface space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: "all", label: "All reminders" },
            { id: "due", label: "May be due" },
            { id: "upcoming", label: "Upcoming" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`min-h-11 rounded-xl border px-4 text-sm ${view === tab.id ? "bg-primary text-primary-foreground" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Input
            aria-label="Search maintenance reminders"
            placeholder="Search a service or provider"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 basis-56"
          />
          <Button variant="outline" disabled={loading || busy} onClick={() => void load()}>
            <RefreshCw size={16} />
            Refresh
          </Button>
        </div>
      </section>
      {error && (
        <p role="alert" className="customer-surface border-red-200 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="customer-surface text-sm">
          {notice}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading maintenance reminders...
        </p>
      )}
      <div className="customer-page-grid">
        {visible.map((item) => (
          <article
            key={item.id}
            className={`customer-surface flex flex-col gap-4 ${item.isDue ? "border-l-4 border-l-orange-500" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <CalendarDays size={22} className="text-primary" />
              {item.isDue && (
                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-900">
                  May be due
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold">{item.title}</h2>
            <p className="text-sm text-muted-foreground">{item.providerName || "Provider not assigned"}</p>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Next due</dt>
                <dd className="font-medium">{date(item.nextDueAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Repeats every</dt>
                <dd>{item.frequencyDays} days</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Last serviced</dt>
                <dd>{item.lastCompletedAt ? date(item.lastCompletedAt) : "Not recorded"}</dd>
              </div>
            </dl>
            <div className="mt-auto flex flex-wrap gap-2 border-t pt-4">
              {(item.offerId || item.serviceId) && (
                <Link
                  href={
                    item.offerId
                      ? `/customer/booking?offer=${encodeURIComponent(item.offerId)}`
                      : `/customer/booking?service=${encodeURIComponent(item.serviceId!)}`
                  }
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
                >
                  Book service
                </Link>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setTarget({ item, action: "serviced" })}
              >
                <CheckCircle2 size={16} />
                Mark serviced
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setTarget({ item, action: "remove" })}>
                Remove reminder
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!loading && !error && !visible.length && (
        <div className="customer-surface space-y-3 py-10 text-center">
          <RefreshCw size={30} className="mx-auto text-primary" />
          <h2 className="text-xl font-semibold">
            {items.length ? "No reminders match this view" : "Make room for fewer last-minute repairs"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {items.length
              ? "Try another filter or search."
              : "Open a completed job and set a recurring reminder for the next service."}
          </p>
        </div>
      )}
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.action === "serviced"
                ? "Record this service as done?"
                : "Remove this recurring reminder?"}
            </DialogTitle>
            <DialogDescription>
              {target?.action === "serviced"
                ? "This updates the next reminder based on the schedule. It does not create a receipt, payment or new booking."
                : "This stops the reminder. Your previous jobs and service records stay available."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-medium">{target?.item.title}</p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              variant={target?.action === "remove" ? "destructive" : "default"}
              onClick={() => void act()}
            >
              {busy
                ? "Saving..."
                : target?.action === "serviced"
                  ? "Confirm service done"
                  : "Remove reminder"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
