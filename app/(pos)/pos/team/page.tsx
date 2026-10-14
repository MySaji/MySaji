"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Loader2, Plus, Users, AlertTriangle, Check, X, Clock, ShieldCheck,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import {
  getTeam, saveTeamMember, setTeamMemberActive,
  type TeamView, type TeamMemberRow,
} from "@/backend/actions/pos-team"

/**
 * The people who work here, and exactly what each one may open.
 *
 * The screen leads with whether somebody has actually signed in yet, because
 * "I added Juma and he says he cannot get in" is the only support question
 * this page generates. A seat that is waiting says so, in words, with the
 * address it is waiting on.
 *
 * Features are shown as the role's set until the owner touches one. The
 * moment they do, the ticks become the whole truth and the screen says so,
 * because a list that silently also inherits from a role is impossible to
 * reason about later.
 */

const BLANK = {
  id: null as string | null,
  name: "",
  role: "CASHIER",
  email: "",
  phone: "",
  storeId: "",
  features: [] as string[],
  customised: false,
}

export default function TeamPage() {
  const [view, setView] = useState<TeamView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState<typeof BLANK | null>(null)

  const refresh = async () => setView(await getTeam())

  useEffect(() => {
    getTeam().then(setView).finally(() => setLoading(false))
  }, [])

  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true); setError("")
    const r = await fn()
    setBusy(false)
    if (!r.success) { setError(r.error ?? "That did not work."); return false }
    await refresh()
    return true
  }

  const edit = (m: TeamMemberRow) => {
    setError("")
    setForm({
      id: m.id, name: m.name, role: m.role,
      email: m.email ?? "", phone: m.phone ?? "", storeId: m.storeId ?? "",
      features: m.customised ? [...m.features] : [],
      customised: m.customised,
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!view) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <Card className="p-6 rounded-2xl text-center">
          <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">Not your business to manage</p>
          <p className="mt-1 text-xs text-muted-foreground">Only an owner or manager can see the team.</p>
        </Card>
      </div>
    )
  }

  /** What this form currently grants, for the preview under the ticks. */
  const roleFeatures = view.roles.find((r) => r.key === form?.role)?.features ?? []
  const effective = form && form.features.length > 0 ? form.features : roleFeatures

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-3 pb-24">
      <Link
        href="/pos/home"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" /> Home
      </Link>

      <div>
        <h1 className="text-xl font-bold text-foreground">Your team</h1>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
          People with their own sign-in. Add them with the email or phone they
          already use, pick what they may open, and they are in the next time
          they sign in. For counter PINs instead, see{" "}
          <Link href="/pos/people" className="text-primary font-medium">Who works the till</Link>.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
        </div>
      )}

      {!form ? (
        <button
          onClick={() => { setForm({ ...BLANK }); setError("") }}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" /> Add someone
        </button>
      ) : (
        <Card className="p-4 rounded-2xl space-y-3">
          <h2 className="text-sm font-bold text-foreground">{form.id ? "Edit" : "Add someone"}</h2>

          <Field label="Their name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })}
            placeholder="The one they already use" />
          <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })}
            placeholder="07..." />

          <div>
            <span className="text-[11px] font-medium text-muted-foreground">What they do</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {view.roles.filter((r) => r.key !== "OWNER").map((r) => (
                <button
                  key={r.key}
                  onClick={() => setForm({ ...form, role: r.key })}
                  className={"rounded-lg border p-2 text-left active:scale-[0.98] " +
                    (form.role === r.key ? "border-primary bg-primary/5" : "border-border")}
                >
                  <span className="block text-xs font-semibold text-foreground">{r.label}</span>
                  <span className="block mt-0.5 text-[10px] text-muted-foreground leading-snug">{r.description}</span>
                </button>
              ))}
            </div>
          </div>

          {view.stores.length > 1 && (
            <div>
              <span className="text-[11px] font-medium text-muted-foreground">Which branch</span>
              <div className="mt-1 flex flex-wrap gap-2">
                <button
                  onClick={() => setForm({ ...form, storeId: "" })}
                  className={"h-9 px-3 rounded-lg text-xs font-semibold active:scale-95 " +
                    (form.storeId === "" ? "bg-primary text-primary-foreground" : "border border-border text-foreground")}
                >
                  All branches
                </button>
                {view.stores.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setForm({ ...form, storeId: s.id })}
                    className={"h-9 px-3 rounded-lg text-xs font-semibold active:scale-95 " +
                      (form.storeId === s.id ? "bg-primary text-primary-foreground" : "border border-border text-foreground")}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ---- the features ------------------------------------------------
              Shown as the role's set until something is ticked. The note
              changes the moment it stops being the role, because an owner who
              cannot tell which they are looking at will not trust either. */}
          <div className="rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-foreground">What they can open</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed">
                  {form.features.length > 0
                    ? "Set by hand. These ticks are exactly what they get, and the role no longer decides."
                    : "Whatever the role above says. Tick anything to decide it yourself."}
                </p>
              </div>
              {form.features.length > 0 && (
                <button
                  onClick={() => setForm({ ...form, features: [] })}
                  className="h-8 px-2 rounded-lg border border-border text-[10px] font-semibold text-muted-foreground active:scale-95 flex-shrink-0"
                >
                  Use the role
                </button>
              )}
            </div>

            <div className="mt-2 space-y-2.5">
              {view.catalogue.map((group) => (
                <div key={group.group}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{group.group}</p>
                  <div className="mt-1 grid sm:grid-cols-2 gap-1">
                    {group.items.map((item) => {
                      const on = effective.includes(item.key)
                      return (
                        <button
                          key={item.key}
                          onClick={() => {
                            // First tick turns the role's set into the starting
                            // point, so nothing silently disappears.
                            const base = form.features.length > 0 ? form.features : [...roleFeatures]
                            const next = base.includes(item.key)
                              ? base.filter((k) => k !== item.key)
                              : [...base, item.key]
                            setForm({ ...form, features: next })
                          }}
                          className={"flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left active:scale-[0.98] " +
                            (on ? "bg-primary/10" : "hover:bg-muted")}
                        >
                          <span className={"w-4 h-4 rounded flex items-center justify-center flex-shrink-0 " +
                            (on ? "bg-primary text-primary-foreground" : "border border-border")}>
                            {on && <Check className="w-3 h-3" />}
                          </span>
                          <span className={"text-[11px] leading-snug " + (on ? "text-foreground font-medium" : "text-muted-foreground")}>
                            {item.label}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                const ok = await run(() => saveTeamMember({
                  id: form.id,
                  name: form.name,
                  role: form.role,
                  email: form.email || null,
                  phone: form.phone || null,
                  storeId: form.storeId || null,
                  features: form.features,
                }))
                if (ok) setForm(null)
              }}
              disabled={busy}
              className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save"}
            </button>
            <button
              onClick={() => { setForm(null); setError("") }}
              className="h-11 px-4 rounded-lg border border-border text-sm font-semibold active:scale-95"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {view.members.length === 0 && !form && (
        <Card className="p-6 rounded-2xl text-center">
          <Users className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm font-semibold text-foreground">Nobody else yet</p>
        </Card>
      )}

      {view.members.map((m) => (
        <Card key={m.id} className="p-4 rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground truncate">
                {m.name}
                {m.isOwnerSeat && <span className="ml-1.5 text-[10px] font-semibold text-primary">you</span>}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {m.roleLabel}
                {m.customised ? " · features set by hand" : ""}
                {m.email ? " · " + m.email : m.phone ? " · " + m.phone : ""}
              </p>
              {/* The question this page exists to answer. */}
              {!m.claimedAt && m.isActive && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 leading-snug flex items-start gap-1">
                  <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  Waiting for them to sign in with {m.email || m.phone}. They get
                  access the moment they do.
                </p>
              )}
              {!m.isActive && (
                <p className="mt-1 text-[11px] text-muted-foreground">Access switched off</p>
              )}
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => edit(m)}
                className="h-9 px-2.5 rounded-lg border border-border text-[11px] font-semibold text-foreground active:scale-95"
              >
                Edit
              </button>
              {!m.isOwnerSeat && (
                <button
                  onClick={() => void run(() => setTeamMemberActive({ id: m.id, isActive: !m.isActive }))}
                  disabled={busy}
                  aria-label={m.isActive ? "Switch off access" : "Restore access"}
                  className="h-9 w-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground active:scale-95 disabled:opacity-50"
                >
                  {m.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </div>
        </Card>
      ))}
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
