"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Calculator, Check, Clock, Loader2, Search, Store,
  AlertTriangle, Save,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  getMyPosSetup, setPosProfile, setPosTraits, updatePosConfig, type PosSetup,
} from "@/lib/actions/pos"
import { POS_TRAITS, POS_TRAIT_META, POS_UNIT_LABEL, type PosTrait } from "@/lib/pos-traits"
import { posProfilesByGroup } from "@/lib/pos-profiles"
import {
  NEGATIVE_STOCK_POLICIES, NEGATIVE_STOCK_POLICY_LABEL, type NegativeStockPolicy,
  EXPIRED_STOCK_POLICIES, EXPIRED_STOCK_POLICY_LABEL, type ExpiredStockPolicy,
} from "@/lib/pos-config"
import { POS_PROFILE_ICON, POS_TRAIT_ICON } from "@/components/pos/pos-profile-icons"

/**
 * Where a shopkeeper changes what their till does.
 *
 * This page is the reason the trait engine exists. A POS that only works for
 * the shops its authors anticipated is not a product, so the preset chosen at
 * signup has to be a starting point that the shopkeeper can move away from —
 * the agrovet that starts stocking gumboots must not have to call support.
 *
 * Three groups, in the order they matter: what kind of shop this is, how it
 * sells, and what the till does when stock runs out.
 */
export default function PosSettingsPage() {
  const [setup, setSetup] = useState<PosSetup | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  // Local draft of the traits, so toggling several feels immediate and saves
  // once. The server is the authority; this is only what the shopkeeper has
  // said so far.
  const [draftTraits, setDraftTraits] = useState<PosTrait[]>([])
  const [profileSearch, setProfileSearch] = useState("")
  const [showProfiles, setShowProfiles] = useState(false)

  const refresh = () =>
    getMyPosSetup().then((s) => {
      setSetup(s)
      setDraftTraits(s?.traits ?? [])
      return s
    })

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [])

  const flash = (msg: string) => {
    setSaved(msg)
    setTimeout(() => setSaved(""), 2500)
  }

  const chooseProfile = async (key: string, applyPreset: boolean) => {
    setBusy("profile"); setError("")
    const r = await setPosProfile({ profileKey: key, applyPreset })
    if (!r.success) setError(r.error)
    else { await refresh(); setShowProfiles(false); setProfileSearch(""); flash("Shop type updated") }
    setBusy(null)
  }

  const toggleTrait = (trait: PosTrait) => {
    setDraftTraits((prev) => (prev.includes(trait) ? prev.filter((t) => t !== trait) : [...prev, trait]))
  }

  const saveTraits = async () => {
    setBusy("traits"); setError("")
    const r = await setPosTraits({ traits: draftTraits })
    if (!r.success) setError(r.error)
    else { await refresh(); flash("Selling behaviours saved") }
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

  if (!setup || !setup.enabled) {
    return (
      <div className="p-4 max-w-2xl mx-auto">
        <Card className="p-6 text-center rounded-2xl">
          <Calculator className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            There is no till on this account to configure.
          </p>
          <Link href="/provider/business-types">
            <Button variant="outline" className="mt-4 h-10 rounded-xl">My Business</Button>
          </Link>
        </Card>
      </div>
    )
  }

  const traitsChanged =
    draftTraits.length !== setup.traits.length ||
    draftTraits.some((t) => !setup.traits.includes(t))

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-3 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/provider/till"
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white flex items-center gap-1 active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" /> Till
        </Link>
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">POS Settings</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Everything here can be changed whenever your shop changes. Nothing is locked by the
          shop type you picked when you signed up.
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

      {/* --- 1. What kind of shop ------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Kind of shop</h2>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center flex-shrink-0">
              <Store className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{setup.profileLabel}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                New products default to {POS_UNIT_LABEL[setup.config.defaultUnit]}
              </p>
            </div>
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => setShowProfiles((v) => !v)}
            className="h-9 rounded-lg text-xs flex-shrink-0"
          >
            {showProfiles ? "Cancel" : "Change"}
          </Button>
        </div>

        {showProfiles && (
          <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <Input
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                placeholder="Search shop types"
                className="h-10 pl-9 rounded-xl"
                autoComplete="off"
              />
            </div>

            {/* Said before they pick, not after. Changing shop type is the one
                action on this page that can discard work, so the choice is
                made explicit rather than defaulted either way. */}
            <p className="mt-2.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
              Choosing a shop type can either keep the selling behaviours you have set, or
              replace them with that shop type&apos;s usual ones.
            </p>

            <div className="mt-2 max-h-[40vh] overflow-y-auto -mx-1 px-1 space-y-3">
              {(() => {
                const q = profileSearch.trim().toLowerCase()
                const groups = posProfilesByGroup()
                  .map((g) => ({
                    ...g,
                    profiles: q
                      ? g.profiles.filter((pr) =>
                          pr.label.toLowerCase().includes(q) || pr.description.toLowerCase().includes(q))
                      : g.profiles,
                  }))
                  .filter((g) => g.profiles.length > 0)

                if (groups.length === 0) {
                  return (
                    <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                      Nothing matches that. General merchandise is the most flexible starting point.
                    </p>
                  )
                }

                return groups.map((g) => (
                  <div key={g.group}>
                    <p className="sticky top-0 z-10 bg-white dark:bg-gray-800 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      {g.label}
                    </p>
                    <div className="mt-1 space-y-1.5">
                      {g.profiles.map((pr) => {
                        const Icon = POS_PROFILE_ICON[pr.icon] ?? Store
                        const current = pr.key === setup.profileKey
                        return (
                          <div
                            key={pr.key}
                            className={`rounded-xl border p-2.5 ${
                              current
                                ? "border-primary bg-primary/5"
                                : "border-gray-200 dark:border-gray-700"
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="mt-0.5 w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 flex items-center justify-center flex-shrink-0">
                                <Icon className="w-3.5 h-3.5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                                  {pr.label}
                                  {current && <span className="ml-1.5 text-[10px] font-normal text-gray-400">current</span>}
                                </p>
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
                                  {pr.description}
                                </p>
                                {!current && (
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <Button
                                      size="sm"
                                      disabled={busy === "profile"}
                                      onClick={() => chooseProfile(pr.key, true)}
                                      className="h-8 rounded-lg text-[11px] px-2.5"
                                    >
                                      {busy === "profile"
                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                        : "Use its usual behaviours"}
                                    </Button>
                                    <Button
                                      size="sm" variant="outline"
                                      disabled={busy === "profile"}
                                      onClick={() => chooseProfile(pr.key, false)}
                                      className="h-8 rounded-lg text-[11px] px-2.5"
                                    >
                                      Keep mine
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>
        )}
      </Card>

      {/* --- 2. How it sells ------------------------------------------------ */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">How you sell</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Switch on only what your shop actually does. Each one changes how the till rings up
          a sale or records stock.
        </p>

        <div className="mt-3 space-y-1.5">
          {POS_TRAITS.map((trait) => {
            const meta = POS_TRAIT_META[trait]
            const Icon = POS_TRAIT_ICON[meta.icon] ?? Check
            const on = draftTraits.includes(trait)
            const live = meta.stage === "live"
            return (
              <button
                key={trait}
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => toggleTrait(trait)}
                className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all active:scale-[0.99] ${
                  on ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <span className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  on
                    ? "bg-primary text-primary-foreground"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">{meta.label}</span>
                    {/* A trait that is switched on but does nothing has to say
                        so here, where it is being switched on — not only on
                        the till home. */}
                    {!live && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                        <Clock className="w-2.5 h-2.5" /> Not working yet
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
                    {meta.effect}
                  </span>
                </span>
                <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  on ? "bg-primary text-primary-foreground" : "border border-gray-300 dark:border-gray-600"
                }`}>
                  {on && <Check className="w-3 h-3" strokeWidth={3} />}
                </span>
              </button>
            )
          })}
        </div>

        {traitsChanged && (
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={saveTraits}
              disabled={busy === "traits"}
              className="h-10 rounded-xl text-xs gap-1.5 flex-1"
            >
              {busy === "traits"
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <><Save className="w-3.5 h-3.5" /> Save changes</>}
            </Button>
            <Button
              variant="outline"
              onClick={() => setDraftTraits(setup.traits)}
              disabled={busy === "traits"}
              className="h-10 rounded-xl text-xs"
            >
              Undo
            </Button>
          </div>
        )}
      </Card>

      {/* --- 3. When stock runs out ----------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">When stock runs out</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          What should the till do if a sale would take an item below zero? Both answers are
          right for different shops, which is why it is a choice.
        </p>
        <div className="mt-3 space-y-1.5">
          {NEGATIVE_STOCK_POLICIES.map((policy) => {
            const on = setup.config.negativeStock === policy
            return (
              <button
                key={policy}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={busy === "negativeStock"}
                onClick={() => saveConfig({ negativeStock: policy as NegativeStockPolicy }, "negativeStock")}
                className={`w-full flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all active:scale-[0.99] disabled:opacity-60 ${
                  on ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-[5px] flex-shrink-0 ${
                  on ? "border-primary" : "border-gray-300 dark:border-gray-600"
                }`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-gray-900 dark:text-white">
                    {NEGATIVE_STOCK_POLICY_LABEL[policy]}
                  </span>
                  <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
                    {policy === "BLOCK" && "Best where the stock figure is trusted — if it says zero, something needs checking."}
                    {policy === "WARN" && "The cashier is told, and decides. A sensible default for most shops."}
                    {policy === "ALLOW" && "Best where the goods are visibly on the counter and the record is simply behind."}
                  </span>
                </span>
                {busy === "negativeStock" && on && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
              </button>
            )
          })}
        </div>
        <p className="mt-2.5 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
          A stock count that finds less than the records claim is always allowed, whichever of
          these is chosen — otherwise you could never correct a figure you know is wrong.
        </p>
      </Card>

      {/* --- 4. expired stock ------------------------------------------------
          Only worth showing to a shop that actually tracks deliveries. */}
      {setup.traits.includes("BATCH_EXPIRY") && (
        <Card className="p-4 rounded-2xl">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">When stock has expired</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            The till always sells the soonest-to-expire delivery first. This is what it does when
            the only stock left is past its date.
          </p>
          <div className="mt-3 space-y-1.5">
            {EXPIRED_STOCK_POLICIES.map((policy) => {
              const on = setup.config.expiredStock === policy
              return (
                <button
                  key={policy}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={busy === "expiredStock"}
                  onClick={() => saveConfig({ expiredStock: policy as ExpiredStockPolicy }, "expiredStock")}
                  className={`w-full flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all active:scale-[0.99] disabled:opacity-60 ${
                    on ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border-[5px] flex-shrink-0 ${
                    on ? "border-primary" : "border-gray-300 dark:border-gray-600"
                  }`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-gray-900 dark:text-white">
                      {EXPIRED_STOCK_POLICY_LABEL[policy]}
                    </span>
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
                      {policy === "BLOCK" && "The right answer for a pharmacy or agrovet, where selling past the date is a licensing matter rather than an inconvenience."}
                      {policy === "WARN" && "The cashier is told and decides. Sensible for a bakery or grocer."}
                      {policy === "ALLOW" && "No warning at all. Only where the date is advisory."}
                    </span>
                  </span>
                  {busy === "expiredStock" && on && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                </button>
              )
            })}
          </div>
          <p className="mt-2.5 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
            Writing an expired batch off is always allowed, whichever of these is chosen.
          </p>
        </Card>
      )}
    </div>
  )
}
