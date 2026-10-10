"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Plus, ShieldCheck, User, UserCheck, UserMinus, X,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getCashiers, saveCashier, setCashierActive, type CashierRow,
} from "@/lib/actions/pos-cashiers"
import { getMyPosSetup, updatePosConfig, type PosSetup } from "@/lib/actions/pos"

/**
 * Who works the till.
 *
 * A shop assistant gets a name and a four-digit PIN here — not a SAJI
 * account. The PIN says who rang up a sale, so that at the end of a week the
 * shopkeeper can answer "who sold this" and "who voided that" without
 * guessing, and can take someone off the till the afternoon they leave.
 *
 * The PIN is not a password and this page does not pretend otherwise: anyone
 * reaching it is already signed in as the shop.
 */
export default function TillPeoplePage() {
  const [rows, setRows] = useState<CashierRow[]>([])
  const [setup, setSetup] = useState<PosSetup | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  // The form, open only while someone is being added or edited.
  const [editing, setEditing] = useState<CashierRow | "new" | null>(null)
  const [name, setName] = useState("")
  const [role, setRole] = useState<"cashier" | "manager">("cashier")
  const [pin, setPin] = useState("")

  const refresh = async () => {
    const [list, s] = await Promise.all([getCashiers(), getMyPosSetup()])
    setRows(list)
    setSetup(s)
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 2500) }

  const openNew = () => { setEditing("new"); setName(""); setRole("cashier"); setPin(""); setError("") }
  const openEdit = (c: CashierRow) => { setEditing(c); setName(c.name); setRole(c.role === "manager" ? "manager" : "cashier"); setPin(""); setError("") }
  const close = () => { setEditing(null); setPin(""); setError("") }

  const submit = async () => {
    setBusy("save"); setError("")
    const r = await saveCashier({
      ...(editing && editing !== "new" ? { cashierId: editing.id } : {}),
      name,
      role,
      ...(pin ? { pin } : {}),
    })
    if (!r.success) setError(r.error)
    else { await refresh(); close(); flash(editing === "new" ? name + " can now sign in" : "Saved") }
    setBusy(null)
  }

  const toggleActive = async (c: CashierRow) => {
    setBusy(c.id); setError("")
    const r = await setCashierActive({ cashierId: c.id, isActive: !c.isActive })
    if (!r.success) setError(r.error)
    else { await refresh(); flash(c.isActive ? c.name + " is off the till" : c.name + " is back on the till") }
    setBusy(null)
  }

  const saveConfig = async (patch: Record<string, unknown>, label: string) => {
    setBusy(label); setError("")
    const r = await updatePosConfig(patch)
    if (!r.success) setError(r.error)
    else { await refresh(); flash("Saved") }
    setBusy(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  const managers = rows.filter((c) => c.isActive && c.role === "manager").length

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/provider/till/settings"
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Who works the till</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Give each person a PIN and their name goes on every sale they ring up. They do not
          need a SAJI account, an email address or a password.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2.5 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" strokeWidth={3} />
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{saved}</p>
        </div>
      )}

      {/* --- the people ----------------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">On the till</h2>
          {editing === null && (
            <Button onClick={openNew} className="h-9 px-3 rounded-xl text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add someone
            </Button>
          )}
        </div>

        {rows.length === 0 && editing === null && (
          <div className="mt-3 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
            <User className="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto" />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Nobody added yet. Sales are recorded under your own name, which is right for a
              shop you run alone — add people only when someone else is on the counter.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {rows.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-2.5 p-3 rounded-xl border ${
                  c.isActive
                    ? "border-gray-200 dark:border-gray-700"
                    : "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40"
                }`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  c.role === "manager" ? "bg-primary/10 text-primary" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                }`}>
                  {c.role === "manager" ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${
                    c.isActive ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-500 line-through"
                  }`}>
                    {c.name}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {c.role === "manager" ? "Manager" : "Cashier"}
                    {c.isOwner && " · you"}
                    {!c.isActive && " · off the till"}
                  </p>
                </div>
                {c.isActive && (
                  <button
                    onClick={() => openEdit(c)}
                    className="h-9 px-3 rounded-lg text-[11px] font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 active:scale-95"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => toggleActive(c)}
                  disabled={busy === c.id}
                  aria-label={c.isActive ? "Take " + c.name + " off the till" : "Put " + c.name + " back on the till"}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 active:scale-95 disabled:opacity-50 ${
                    c.isActive
                      ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  }`}
                >
                  {busy === c.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : c.isActive ? <UserMinus className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* --- add / edit --------------------------------------------------- */}
        {editing !== null && (
          <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-900 dark:text-white">
                {editing === "new" ? "Add someone to the till" : "Edit " + editing.name}
              </p>
              <button onClick={close} aria-label="Cancel" className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 active:scale-95">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Wanjiku"
                className="mt-1 h-11 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Can they void a sale?</label>
              <div className="mt-1 flex gap-1.5">
                {(["cashier", "manager"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={
                      role === r
                        ? "flex-1 h-11 rounded-xl border text-xs font-semibold active:scale-95 border-primary bg-primary/10 text-primary"
                        : "flex-1 h-11 rounded-xl border text-xs font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }
                  >
                    {r === "cashier" ? "Cashier" : "Manager"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                A manager can approve a void. A cashier cannot.
              </p>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                {editing === "new" ? "PIN (4 to 6 digits)" : "New PIN — leave blank to keep the old one"}
              </label>
              <Input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="off"
                placeholder="••••"
                className="mt-1 h-11 rounded-xl text-sm tracking-[0.4em] font-mono"
              />
            </div>
            <Button
              onClick={submit}
              disabled={busy === "save" || name.trim().length < 2 || (editing === "new" && pin.length < 4)}
              className="w-full h-11 rounded-xl text-sm"
            >
              {busy === "save" ? <Loader2 className="w-4 h-4 animate-spin" /> : editing === "new" ? "Add to till" : "Save"}
            </Button>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
              PINs are stored scrambled and cannot be read back — not by us either. If someone
              forgets theirs, set a new one here.
            </p>
          </div>
        )}
      </Card>

      {/* --- what the PIN is asked for -------------------------------------- */}
      {setup && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">When a PIN is asked for</h2>
          <div className="mt-3 space-y-1.5">
            <ConfigToggle
              on={setup.config.requirePinPerSale}
              busy={busy === "requirePinPerSale"}
              onClick={() => saveConfig({ requirePinPerSale: !setup.config.requirePinPerSale }, "requirePinPerSale")}
              title="Ask for a PIN on every sale"
              body={
                rows.filter((c) => c.isActive).length === 0
                  ? "Nobody is on the till yet, so this does nothing until you add someone."
                  : "For a counter several people share. Off, whoever signed in stays signed in until they sign out."
              }
            />
            <ConfigToggle
              on={setup.config.managerPinToVoid}
              busy={busy === "managerPinToVoid"}
              onClick={() => saveConfig({ managerPinToVoid: !setup.config.managerPinToVoid }, "managerPinToVoid")}
              title="A manager must approve a void"
              body={
                managers === 0
                  ? "No managers on the till yet, so voids are not blocked — you would have no way to approve one."
                  : "Voiding is the one till action that takes money out of the day's takings."
              }
            />
          </div>
        </Card>
      )}
    </div>
  )
}

function ConfigToggle({
  on, busy, onClick, title, body,
}: {
  on: boolean
  busy: boolean
  onClick: () => void
  title: string
  body: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onClick}
      className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all active:scale-[0.99] disabled:opacity-60 ${
        on ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
      }`}
    >
      <span className={`mt-0.5 w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${
        on ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
      }`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-gray-900 dark:text-white">{title}</span>
        <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">{body}</span>
      </span>
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mt-0.5" />}
    </button>
  )
}
