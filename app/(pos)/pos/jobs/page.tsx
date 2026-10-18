"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import {
  ArrowLeft, ClipboardList, Loader2, Plus, Check, X, Hammer, AlertTriangle, Wrench, Package,
} from "lucide-react"
import {
  getJobCards, createJobCard, addJobLine, removeJobLine, setJobStatus, collectJob,
  type JobCardRow,
} from "@/backend/actions/pos-jobs"

/**
 * Work taken in: a garage, a repair bench, a laundry, a car wash.
 *
 * The page leads with what is owed and what state the job is in, because the
 * two questions asked at this counter all day are "is it ready" and "how much".
 *
 * A job that has not been collected is never shown as money taken. The
 * balance is labelled as owed, not earned, right up until collection, which
 * is the only place a sale is raised.
 */

const sh = (v: number) =>
  v.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_META: Record<JobCardRow["status"], { label: string; tone: string }> = {
  RECEIVED: { label: "Booked in", tone: "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400" },
  IN_PROGRESS: { label: "Being worked on", tone: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  READY: { label: "Ready", tone: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" },
  COLLECTED: { label: "Collected", tone: "bg-muted text-muted-foreground" },
  CANCELLED: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobCardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)

  const [form, setForm] = useState({
    customerName: "", customerPhone: "", itemDescription: "",
    itemIdentifier: "", faultReported: "", accessories: "", depositPaid: "",
  })
  const [line, setLine] = useState({ kind: "LABOUR" as "LABOUR" | "PART", description: "", quantity: "1", unitPrice: "" })

  const refresh = async () => setJobs(await getJobCards({}))

  useEffect(() => {
    getJobCards({}).then(setJobs).finally(() => setLoading(false))
  }, [])

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true); setError("")
    const r = await fn()
    setBusy(false)
    if (!r.success) { setError(r.error ?? "That did not work."); return false }
    await refresh()
    return true
  }

  const book = async () => {
    const ok = await run(() => createJobCard(form))
    if (ok) {
      setForm({ customerName: "", customerPhone: "", itemDescription: "", itemIdentifier: "", faultReported: "", accessories: "", depositPaid: "" })
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 w-full min-w-0 space-y-5 pb-12">
      <Link
        href="/pos/sell"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      <div>
        <WorkspaceHeading title="Jobs" />
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          Work left with you: booked in with a ticket, worked on, and rung up when
          it is collected. Nothing counts as takings until the customer has it back.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {!adding ? (
        <button
          onClick={() => { setAdding(true); setError("") }}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> Book something in
        </button>
      ) : (
        <Card className="p-4 rounded-2xl space-y-2">
          <h2 className="text-sm font-bold text-foreground">Book something in</h2>
          <Field label="Whose is it" value={form.customerName} onChange={(v) => setForm({ ...form, customerName: v })} placeholder="Customer name" />
          <Field label="Phone" value={form.customerPhone} onChange={(v) => setForm({ ...form, customerPhone: v })} placeholder="07..." />
          <Field label="What was left" value={form.itemDescription} onChange={(v) => setForm({ ...form, itemDescription: v })} placeholder="Toyota Probox, iPhone 11, 3 shirts" />
          <Field label="How you will find it again" value={form.itemIdentifier} onChange={(v) => setForm({ ...form, itemIdentifier: v })} placeholder="Plate, IMEI or tag number" />
          <Field label="What they say is wrong" value={form.faultReported} onChange={(v) => setForm({ ...form, faultReported: v })} placeholder="In their words" />
          {/* Asked at intake because this is what goes missing and what the
              argument at collection is about. */}
          <Field label="What came with it" value={form.accessories} onChange={(v) => setForm({ ...form, accessories: v })} placeholder="Charger, spare wheel, buttons" />
          <Field label="Deposit taken" value={form.depositPaid} onChange={(v) => setForm({ ...form, depositPaid: v.replace(/[^\d.]/g, "") })} placeholder="0" />
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => void book()}
              disabled={busy}
              className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Book it in"}
            </button>
            <button
              onClick={() => { setAdding(false); setError("") }}
              className="h-11 px-4 rounded-lg border border-border text-sm font-semibold active:scale-95"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {jobs.length === 0 && !adding && (
        <Card className="p-6 rounded-2xl text-center">
          <ClipboardList className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">Nothing booked in</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            A garage, a repair bench, a laundry and a car wash all work the same
            way here: something is left, it gets a ticket, it gets collected.
          </p>
        </Card>
      )}

      {jobs.map((j) => {
        const meta = STATUS_META[j.status]
        const isOpen = openId === j.id
        const done = j.status === "COLLECTED" || j.status === "CANCELLED"
        return (
          <Card key={j.id} className="rounded-2xl overflow-hidden">
            <button
              onClick={() => { setOpenId(isOpen ? null : j.id); setError("") }}
              className="w-full p-4 text-left active:bg-muted/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {j.reference} &middot; {j.itemDescription}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {j.customerName}
                    {j.itemIdentifier ? " · " + j.itemIdentifier : ""}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={"inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold " + meta.tone}>
                    {meta.label}
                  </span>
                  {j.total > 0 && (
                    <p className="mt-1 text-sm font-bold tabular-nums text-foreground">{sh(j.total)}</p>
                  )}
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border p-4 space-y-3">
                {j.faultReported && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">Reported: </span>{j.faultReported}
                  </p>
                )}
                {j.accessories && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <span className="font-semibold text-foreground">Came with: </span>{j.accessories}
                  </p>
                )}

                {j.lines.length > 0 && (
                  <ul className="divide-y divide-border">
                    {j.lines.map((l) => (
                      <li key={l.id} className="py-2 flex items-center gap-2">
                        {l.kind === "LABOUR"
                          ? <Wrench className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          : <Package className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                        <span className="min-w-0 flex-1 text-xs text-foreground truncate">{l.description}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {l.quantity} &times; {sh(l.unitPrice)}
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-foreground w-20 text-right">{sh(l.total)}</span>
                        {!done && (
                          <button
                            onClick={() => void run(() => removeJobLine({ lineId: l.id }))}
                            aria-label="Remove this line"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground active:scale-90"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="rounded-lg bg-muted/50 p-2.5 space-y-1">
                  <Row label="Work and parts" value={sh(j.total)} />
                  {j.depositPaid > 0 && <Row label="Deposit already paid" value={"-" + sh(j.depositPaid)} />}
                  <div className="flex items-baseline justify-between pt-1 border-t border-border">
                    <span className="text-xs font-semibold text-foreground">
                      {j.status === "COLLECTED" ? "Paid" : "Still owed"}
                    </span>
                    <span className="text-base font-bold tabular-nums text-foreground">{sh(j.balanceDue)}</span>
                  </div>
                </div>

                {!done && (
                  <div className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex gap-2">
                      {(["LABOUR", "PART"] as const).map((k) => (
                        <button
                          key={k}
                          onClick={() => setLine({ ...line, kind: k })}
                          className={"flex-1 h-10 rounded-lg text-xs font-semibold active:scale-95 " +
                            (line.kind === k ? "bg-primary text-primary-foreground" : "border border-border text-foreground")}
                        >
                          {k === "LABOUR" ? "Labour" : "Part"}
                        </button>
                      ))}
                    </div>
                    <input
                      value={line.description}
                      onChange={(e) => setLine({ ...line, description: e.target.value })}
                      placeholder={line.kind === "LABOUR" ? "What was done" : "Which part"}
                      className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => setLine({ ...line, quantity: e.target.value.replace(/[^\d.]/g, "") })}
                        placeholder="Qty"
                        className="w-20 h-11 px-3 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
                      />
                      <input
                        inputMode="decimal"
                        value={line.unitPrice}
                        onChange={(e) => setLine({ ...line, unitPrice: e.target.value.replace(/[^\d.]/g, "") })}
                        placeholder="Price each"
                        className="flex-1 h-11 px-3 rounded-lg border border-border bg-background text-sm text-right tabular-nums"
                      />
                      <button
                        onClick={async () => {
                          const ok = await run(() => addJobLine({ jobId: j.id, ...line }))
                          if (ok) setLine({ kind: line.kind, description: "", quantity: "1", unitPrice: "" })
                        }}
                        disabled={busy}
                        className="h-11 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-95 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {j.status === "RECEIVED" && (
                    <button
                      onClick={() => void run(() => setJobStatus({ id: j.id, status: "IN_PROGRESS" }))}
                      disabled={busy}
                      className="h-10 px-3 rounded-xl border border-border text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <Hammer className="w-3.5 h-3.5" /> Start work
                    </button>
                  )}
                  {(j.status === "RECEIVED" || j.status === "IN_PROGRESS") && (
                    <>
                      <button
                        onClick={() => void run(() => setJobStatus({ id: j.id, status: "READY" }))}
                        disabled={busy}
                        className="h-10 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" /> Mark ready
                      </button>
                      <button
                        onClick={() => {
                          const why = window.prompt("Why is this job being cancelled?")
                          if (why) void run(() => setJobStatus({ id: j.id, status: "CANCELLED", reason: why }))
                        }}
                        disabled={busy}
                        className="h-10 px-3 rounded-xl border border-border text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" /> Cancel
                      </button>
                    </>
                  )}
                  {j.status === "READY" && (
                    <button
                      onClick={() => void run(() => collectJob({ id: j.id, paymentMethod: "CASH", amountPaid: j.balanceDue }))}
                      disabled={busy}
                      className="h-10 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Collect and take {sh(j.balanceDue)}
                    </button>
                  )}
                  {j.status === "COLLECTED" && (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Rung up as a sale, so it is in the day&rsquo;s takings and the shift
                      alongside counter sales. Any parts have left stock.
                    </p>
                  )}
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-0.5 w-full h-11 px-3 rounded-lg border border-border bg-background text-sm"
      />
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] tabular-nums text-foreground">{value}</span>
    </div>
  )
}
