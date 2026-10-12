"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Receipt, RefreshCw, ShieldCheck, Clock, X,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getEtimsSettings, saveEtimsSettings, registerEtimsDevice, getEtimsQueue,
  sendQueuedInvoice, flushEtimsQueue,
  type EtimsSettings, type EtimsQueueRow,
} from "@/backend/actions/pos-etims"

/**
 * Declaring sales to KRA.
 *
 * WHAT THIS PAGE HAS TO BE HONEST ABOUT
 *
 * Three different states look alike to a shopkeeper and are not: not filing
 * at all, filing but not yet registered, and registered but behind. Each one
 * is said in plain words here, because the one thing worse than being behind
 * on your returns is believing you are not.
 *
 * The queue is shown rather than hidden. A number of unsigned invoices is
 * exactly the thing a shopkeeper needs to see before the month ends.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_META: Record<string, { label: string; cls: string }> = {
  SIGNED: { label: "Signed by KRA", cls: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" },
  QUEUED: { label: "Waiting to send", cls: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  FAILED: { label: "Could not send", cls: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400" },
  REJECTED: { label: "KRA refused it", cls: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
  SKIPPED: { label: "Not declared", cls: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" },
}

export default function TillEtimsPage() {
  const [view, setView] = useState<EtimsSettings>(null)
  const [queue, setQueue] = useState<EtimsQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const [tin, setTin] = useState("")
  const [branchId, setBranchId] = useState("00")
  const [serial, setSerial] = useState("")
  const [env, setEnv] = useState("sandbox")
  const [defaultCode, setDefaultCode] = useState("B")

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 5000) }

  const load = async () => {
    const [v, q] = await Promise.all([getEtimsSettings({}), getEtimsQueue({ limit: 40 })])
    setView(v)
    setQueue(q)
    if (v) {
      setTin(v.tin ?? "")
      setBranchId(v.branchId)
      setSerial(v.deviceSerial ?? "")
      setEnv(v.env)
      setDefaultCode(v.defaultTaxCode)
    }
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async (patch: Record<string, unknown>, label: string) => {
    setBusy(label); setError("")
    const r = await saveEtimsSettings(patch)
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await load()
    flash(r.message ?? "Saved")
  }

  const register = async () => {
    setBusy("register"); setError("")
    const r = await registerEtimsDevice({})
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await load()
    flash(r.message ?? "Registered with KRA")
  }

  const retry = async (row: EtimsQueueRow) => {
    setBusy(row.id); setError("")
    const r = await sendQueuedInvoice({ invoiceId: row.id })
    setBusy(null)
    if (!r.success) { setError(r.error); await load(); return }
    await load()
    flash(r.message ?? "Sent")
  }

  const flush = async () => {
    setBusy("flush"); setError("")
    const r = await flushEtimsQueue({ limit: 20 })
    setBusy(null)
    await load()
    flash(
      r.sent === 0 && r.failed === 0
        ? "Nothing was waiting."
        : r.sent + " sent, " + r.failed + " still waiting" + (r.left > 0 ? ", " + r.left + " left on the queue" : ""),
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!view) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <Receipt className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            There is no till on this account, or your role does not include tax settings.
          </p>
          <Link href="/provider/till"><Button variant="outline" className="mt-4 h-10 rounded-xl">Back to the till</Button></Link>
        </Card>
      </div>
    )
  }

  const dirty =
    tin !== (view.tin ?? "") || branchId !== view.branchId ||
    serial !== (view.deviceSerial ?? "") || env !== view.env || defaultCode !== view.defaultTaxCode

  return (
    <div className="p-3 max-w-3xl mx-auto space-y-3 pb-24">
      <Link href="/provider/till/settings" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
        <ArrowLeft className="w-4 h-4" /> Settings
      </Link>

      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-snug">{saved}</p>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {/* ---- where this shop stands -------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-start gap-3">
          <span className={
            view.enabled && view.registered
              ? "w-9 h-9 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center flex-shrink-0"
              : "w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400 flex items-center justify-center flex-shrink-0"
          }>
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">KRA eTIMS</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
              {!view.enabled
                ? "Off. Your receipts are sales slips, not tax invoices. Switch this on only if you are VAT registered."
                : !view.registered
                  ? "On, but this till has not been registered with KRA yet, so nothing can be signed."
                  : "On. Every sale is sent to KRA and the signature is printed on the receipt."}
            </p>
          </div>
        </div>

        {!view.reachable && (
          <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/15 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              This site has no KRA address configured for the {view.env} environment.
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug mt-0.5">
              Nothing can be filed until support sets it. Sales are still recorded and will be
              sent once it is, so nothing is lost in the meantime.
            </p>
          </div>
        )}

        {view.canManage && (
          <button
            type="button"
            role="switch"
            aria-checked={view.enabled}
            disabled={busy === "enabled"}
            onClick={() => void save({ enabled: !view.enabled }, "enabled")}
            className={
              view.enabled
                ? "mt-3 w-full flex items-center gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] disabled:opacity-60 border-primary bg-primary/5"
                : "mt-3 w-full flex items-center gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] disabled:opacity-60 border-gray-200 dark:border-gray-700"
            }
          >
            <span className={
              view.enabled
                ? "w-9 h-5 rounded-full bg-primary flex items-center px-0.5 flex-shrink-0 justify-end"
                : "w-9 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center px-0.5 flex-shrink-0"
            }>
              <span className="w-4 h-4 rounded-full bg-white block" />
            </span>
            <span className="min-w-0 flex-1 text-xs font-semibold text-gray-900 dark:text-white">
              {view.enabled ? "Declaring sales to KRA" : "Not declaring anything"}
            </span>
            {busy === "enabled" && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />}
          </button>
        )}
      </Card>

      {/* ---- the taxpayer ------------------------------------------------- */}
      {view.canManage && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Who is filing</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            These identify you to KRA. They are yours, not ours, and invoices are filed under
            this PIN.
          </p>

          <div className="mt-3 space-y-2.5">
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">Your KRA PIN</span>
              <Input
                value={tin}
                onChange={(e) => setTin(e.target.value.toUpperCase())}
                placeholder="P051234567X"
                className="mt-1 h-11 rounded-xl text-sm tabular-nums"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">Branch</span>
                <Input
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  placeholder="00"
                  className="mt-1 h-11 rounded-xl text-sm tabular-nums"
                />
                <span className="block mt-1 text-[11px] text-gray-400 leading-snug">
                  00 unless KRA gave this shop its own number.
                </span>
              </label>
              <label className="block">
                <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">Device serial</span>
                <Input
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  placeholder="From KRA"
                  className="mt-1 h-11 rounded-xl text-sm tabular-nums"
                />
                <span className="block mt-1 text-[11px] text-gray-400 leading-snug">
                  One per till. KRA refuse a second using the same one.
                </span>
              </label>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">Which KRA</span>
              <div className="mt-1.5 flex gap-1.5">
                {["sandbox", "production"].map((e) => (
                  <button
                    key={e}
                    onClick={() => setEnv(e)}
                    aria-pressed={env === e}
                    className={
                      env === e
                        ? "h-10 px-3 rounded-xl border text-[11px] font-semibold active:scale-95 border-primary bg-primary/5 text-primary"
                        : "h-10 px-3 rounded-xl border text-[11px] font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }
                  >
                    {e === "sandbox" ? "Testing" : "Live"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-400 leading-snug">
                Invoices filed against the test service are not real returns. Switch to live
                only when KRA have told you to.
              </p>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                How to treat a product with no tax code of its own
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {view.taxCodes.map((t) => (
                  <button
                    key={t.code}
                    onClick={() => setDefaultCode(t.code)}
                    aria-pressed={defaultCode === t.code}
                    className={
                      defaultCode === t.code
                        ? "h-9 px-2.5 rounded-lg border text-[11px] font-semibold active:scale-95 border-primary bg-primary/5 text-primary"
                        : "h-9 px-2.5 rounded-lg border text-[11px] font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }
                  >
                    {t.code} · {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-400 leading-snug">
                {view.taxCodes.find((t) => t.code === defaultCode)?.note}
              </p>
            </div>

            <Button
              onClick={() => void save({ tin, branchId, deviceSerial: serial, env, defaultTaxCode: defaultCode }, "details")}
              disabled={busy === "details" || !dirty}
              className="w-full h-11 rounded-xl text-xs"
            >
              {busy === "details" ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save these details" : "Saved"}
            </Button>
          </div>
        </Card>
      )}

      {/* ---- registering --------------------------------------------------- */}
      {view.canManage && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Register this till</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            KRA hand back a key that this till uses on every invoice. Done once, and again if
            you change the PIN, the serial or the environment.
          </p>
          {view.initialisedAt && (
            <p className="mt-2 text-[11px] text-gray-500 tabular-nums">
              Registered {new Date(view.initialisedAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          )}
          {!view.canStoreSecrets && (
            <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400 leading-snug">
              This site cannot store the KRA key securely yet, so registering would leave it
              unprotected. Ask support to set that up first.
            </p>
          )}
          <Button
            onClick={() => void register()}
            disabled={busy === "register" || !view.canStoreSecrets || !view.reachable}
            variant={view.registered ? "outline" : "default"}
            className="mt-3 w-full h-11 rounded-xl text-xs"
          >
            {busy === "register"
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : view.registered ? "Register again" : "Register with KRA"}
          </Button>
        </Card>
      )}

      {/* ---- the queue ------------------------------------------------------ */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Invoices</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
              {view.signed} signed
              {view.queued > 0 ? ", " + view.queued + " waiting" : ""}
              {view.failed > 0 ? ", " + view.failed + " to retry" : ""}
              {view.rejected > 0 ? ", " + view.rejected + " refused" : ""}
            </p>
          </div>
          {(view.queued > 0 || view.failed > 0) && (
            <Button
              onClick={() => void flush()}
              disabled={busy === "flush"}
              variant="outline"
              className="h-10 rounded-xl text-[11px] font-semibold flex-shrink-0"
            >
              {busy === "flush"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
              Send waiting
            </Button>
          )}
        </div>

        {queue.length === 0 ? (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Nothing yet. Invoices appear here as sales are rung up.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {queue.map((row) => {
              const meta = STATUS_META[row.status] ?? STATUS_META.SKIPPED
              return (
                <div key={row.id} className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                        {row.invoiceNumber}
                        {row.kind === "CREDIT_NOTE" && (
                          <span className="ml-1 text-[10px] font-normal text-gray-400">credit note</span>
                        )}
                      </p>
                      <p className="text-[11px] text-gray-400 tabular-nums">
                        KSh {sh(row.total)}
                        {" · "}
                        {new Date(row.occurredAt).toLocaleString("en-KE", { dateStyle: "short", timeStyle: "short" })}
                      </p>
                    </div>
                    <span className={"h-6 px-2 rounded-md text-[10px] font-semibold flex items-center flex-shrink-0 " + meta.cls}>
                      {meta.label}
                    </span>
                  </div>

                  {row.receiptSignature && (
                    <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 break-all tabular-nums">
                      CU {row.receiptNumber} · {row.receiptSignature}
                    </p>
                  )}
                  {row.lastError && row.status !== "SIGNED" && (
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                      {row.lastError}
                      {row.attempts > 1 ? " (tried " + row.attempts + " times)" : ""}
                    </p>
                  )}

                  {row.status !== "SIGNED" && row.status !== "SKIPPED" && view.canManage && (
                    <button
                      onClick={() => void retry(row)}
                      disabled={busy === row.id}
                      className="mt-2 inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-95 disabled:opacity-60"
                    >
                      {busy === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                      Send it now
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug px-0.5">
        A sale is never held up by KRA. It is recorded first and sent afterwards, so a slow
        connection costs you nothing at the counter. Until an invoice is signed its receipt
        says plainly that it is not yet a tax invoice.
      </p>
    </div>
  )
}
