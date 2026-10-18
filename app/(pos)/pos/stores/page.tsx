"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Plus, Store, X, Ban, ArrowRightLeft, Package, Users,
} from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getMyStores, addStore, switchStore, closeStore,
  type StoresView, type StoreRow,
} from "@/backend/actions/pos-stores"

/**
 * Branches.
 *
 * WHAT THIS PAGE IS FOR
 *
 * Two things a shopkeeper with more than one duka needs: to see all of them
 * at once, and to move between them. The takings so far today sit on each
 * card because that is the number that makes a shopkeeper open this page in
 * the first place.
 *
 * WHY SWITCHING IS LOUD
 *
 * Everything the till does afterwards belongs to the branch chosen here: the
 * products on the grid, the stock that moves, the shift, the drawer. A
 * cashier who did not notice the switch would sell Westlands stock from the
 * Kawangware counter, so the current branch is stated plainly and the switch
 * confirms what it has done.
 */

const sh = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function TillStoresPage() {
  const [view, setView] = useState<StoresView>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const [addOpen, setAddOpen] = useState(false)
  const [name, setName] = useState("")
  const [closing, setClosing] = useState<StoreRow | null>(null)

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 4000) }

  const reload = async () => setView(await getMyStores({}))

  useEffect(() => {
    getMyStores({}).then((v) => { setView(v); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const submit = async () => {
    setBusy("add"); setError("")
    const r = await addStore({ name: name.trim() })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await reload()
    flash(name.trim() + " is open. It starts with no stock, so receive what is on its shelves.")
    setAddOpen(false); setName("")
  }

  const move = async (row: StoreRow) => {
    setBusy(row.id); setError("")
    const r = await switchStore({ storeId: row.id })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await reload()
    flash("You are now working in " + row.name + ". The till, the stock and the takings are all its own.")
  }

  const close = async () => {
    if (!closing) return
    setBusy("close"); setError("")
    const r = await closeStore({ storeId: closing.id })
    setBusy(null)
    if (!r.success) { setError(r.error); return }
    await reload()
    flash(closing.name + " is closed. Its sales and stock history are still on the record.")
    setClosing(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!view) {
    return (
      <div className="p-4 w-full min-w-0">
        <Card className="p-6 text-center rounded-2xl">
          <Store className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            There is no till on this account, or your role does not include branch settings.
          </p>
          <Link href="/pos/sell"><Button variant="outline" className="mt-4 h-10 rounded-xl">Back to the till</Button></Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 w-full min-w-0 space-y-5 pb-12">
      <Link href="/pos/sell" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white active:scale-95 transition-transform">
        <ArrowLeft className="w-4 h-4" /> Till
      </Link>

      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-start gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-snug">{saved}</p>
        </div>
      )}
      {error && !addOpen && !closing && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      <div>
        <WorkspaceHeading title={view.businessName} />
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
          {view.rows.length === 1
            ? "One branch. Open another and each keeps its own stock, staff and takings."
            : view.rows.length + " branches, each with its own stock, staff and takings."}
        </p>
      </div>

      <div className="space-y-2">
        {view.rows.map((row) => (
          <Card
            key={row.id}
            className={
              row.active
                ? "p-4 rounded-2xl border-primary bg-primary/5"
                : "p-4 rounded-2xl"
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">{row.name}</h2>
                  {row.active && (
                    <span className="h-5 px-2 rounded-md text-[10px] font-semibold bg-primary text-white flex items-center">
                      You are here
                    </span>
                  )}
                  {row.isMain && (
                    <span className="h-5 px-2 rounded-md text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center">
                      Main
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Package className="w-3 h-3" /> {row.productCount} product{row.productCount === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Users className="w-3 h-3" /> {row.staffCount} staff
                  </span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">Today</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums">
                  KSh {sh(row.takingsToday)}
                </p>
              </div>
            </div>

            {!row.active && (
              <div className="mt-2.5 flex gap-1.5">
                <Button
                  onClick={() => void move(row)}
                  disabled={busy === row.id}
                  variant="outline"
                  className="h-10 rounded-xl text-[11px] font-semibold"
                >
                  {busy === row.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />}
                  Work in {row.name}
                </Button>
                {view.canManage && !row.isMain && (
                  <button
                    onClick={() => { setClosing(row); setError("") }}
                    className="h-10 px-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-500 active:scale-95 inline-flex items-center gap-1"
                  >
                    <Ban className="w-3 h-3" /> Close
                  </button>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {view.canManage && (
        <Button onClick={() => { setAddOpen(true); setError("") }} className="w-full h-12 rounded-xl text-sm font-semibold">
          <Plus className="w-4 h-4 mr-1" /> Open another branch
        </Button>
      )}

      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug px-0.5">
        A branch shares your staff list and your subscription. It does not share stock: what is
        on the shelf at one is not on the shelf at another, which is the whole point of counting
        them separately.
      </p>

      {addOpen && (
        <Sheet title="Open another branch" onClose={() => setAddOpen(false)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            It starts with your current settings and an empty shelf. Receive stock into it the
            same way you do here, and post staff to it from the people page.
          </p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kawangware"
            className="mt-3 h-12 rounded-xl text-base"
            autoFocus
          />
          <p className="mt-1 text-[11px] text-gray-400 leading-snug">
            Name it after the place, not the business. That is what tells two branches apart on
            a receipt.
          </p>
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>}
          <Button
            onClick={() => void submit()}
            disabled={busy === "add" || name.trim().length < 2}
            className="mt-3 w-full h-12 rounded-xl text-sm font-semibold"
          >
            {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Open it"}
          </Button>
        </Sheet>
      )}

      {closing && (
        <Sheet title={"Close " + closing.name} onClose={() => setClosing(null)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            It comes off the switcher and nobody stays posted to it. Its sales, its stock
            movements and its shifts stay exactly where they are, because they are your record of
            what happened there.
          </p>
          {closing.productCount > 0 && (
            <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400 leading-snug">
              It still lists {closing.productCount} product{closing.productCount === 1 ? "" : "s"}.
              Whatever stock is on its shelves will not move to another branch by itself.
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>}
          <Button
            onClick={() => void close()}
            disabled={busy === "close"}
            className="mt-3 w-full h-12 rounded-xl text-sm font-semibold"
          >
            {busy === "close" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Close this branch"}
          </Button>
        </Sheet>
      )}
    </div>
  )
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl p-4 pb-8 sm:pb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="min-w-0 text-sm font-bold text-gray-900 dark:text-white leading-snug">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 -mr-1 -mt-1 rounded-xl flex items-center justify-center text-gray-400 active:scale-95 flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
