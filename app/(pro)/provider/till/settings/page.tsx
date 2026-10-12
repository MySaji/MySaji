"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Calculator, Check, Clock, Loader2, Search, Store,
  AlertTriangle, Save, Users, ChevronRight, Monitor, MonitorDown, Smartphone,
  LayoutDashboard, Truck, RotateCcw, Star, Package, Wallet, Receipt,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import {
  getMyPosSetup, setPosProfile, setPosTraits, updatePosConfig, type PosSetup,
} from "@/backend/actions/pos"
import { POS_TRAITS, POS_TRAIT_META, POS_UNIT_LABEL, type PosTrait } from "@/backend/domain/pos-traits"
import { posProfilesByGroup } from "@/backend/domain/pos-profiles"
import {
  NEGATIVE_STOCK_POLICIES, NEGATIVE_STOCK_POLICY_LABEL, type NegativeStockPolicy,
  EXPIRED_STOCK_POLICIES, EXPIRED_STOCK_POLICY_LABEL, type ExpiredStockPolicy,
} from "@/backend/domain/pos-config"
import { POS_PROFILE_ICON, POS_TRAIT_ICON } from "@/frontend/components/pos/pos-profile-icons"

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
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95 transition-transform"
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

      {/* --- who works the till ---------------------------------------------
          Its own page: a list that grows, a form, and two settings that only
          make sense next to that list. */}
      <Link href="/provider/till/stores" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Store className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Branches</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Run more than one shop on this account, and move between them.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/people" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Users className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Who works the till</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Give each person a PIN and their name goes on the sales they ring up.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/dashboard" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <LayoutDashboard className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Dashboard</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Today's takings, what is running low and what is selling.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/products" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Package className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Products and prices</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              What you sell, what you charge, and what each line actually makes you.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/customers" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Star className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Customers and points</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Your regulars, what they have spent, and the points they are holding.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/expenses" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Costs and what you kept</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Rent, power, wages and transport, against the month's takings.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/purchasing" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Truck className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Buying</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Suppliers, orders, and recording what actually turned up.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/etims" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Receipt className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">KRA eTIMS</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Declare sales and print signed tax invoices, if you are VAT registered.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/mpesa" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Taking M-Pesa</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Your paybill or till number, and prompting the customer's phone to pay.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/subscription" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Your subscription</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              What the till costs you, and what has been paid.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/get" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <MonitorDown className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Get your till</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Install it on the counter machine, or send the address to the phone that will be the till.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

      <Link href="/provider/till/devices" className="block active:scale-[0.99] transition-transform">
        <Card className="p-4 rounded-2xl flex items-center gap-3">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Monitor className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-gray-900 dark:text-white">Devices</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              Which phones and computers have your till open, and when each was last heard from.
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
        </Card>
      </Link>

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

      {/* --- points -------------------------------------------------------
          A scheme stays off until a shop deliberately turns it on, because a
          half configured scheme that has already started handing out points
          is worse than no scheme at all. */}
      <LoyaltyCard
        config={setup.config}
        busy={busy === "loyalty"}
        onSave={(patch) => saveConfig(patch, "loyalty")}
      />

      {/* --- rounding ------------------------------------------------------- */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Rounding the total</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Kenya has no coin below 1/-, and many shops round to 5/-. The total is rounded
          <span className="font-semibold"> down</span>, never up — rounding up is taking money
          nobody agreed to.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[0, 1, 5, 10].map((step) => {
            const on = setup.config.cashRounding === step
            return (
              <button
                key={step}
                onClick={() => saveConfig({ cashRounding: step }, "cashRounding")}
                aria-pressed={on}
                disabled={busy === "cashRounding"}
                className={
                  on
                    ? "h-10 px-4 rounded-xl border text-xs font-semibold active:scale-95 border-primary bg-primary/5 text-primary"
                    : "h-10 px-4 rounded-xl border text-xs font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                }
              >
                {step === 0 ? "No rounding" : "To " + step + "/-"}
              </button>
            )
          })}
          {busy === "cashRounding" && <Loader2 className="w-4 h-4 animate-spin text-gray-400 self-center" />}
        </div>
        <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
          Whatever comes off shows on the receipt as a discount, so the slip still adds up and
          you can see what rounding costs over a day.
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

/**
 * The points scheme.
 *
 * Three numbers decide everything: how fast points are earned, what one is
 * worth when spent, and the smallest number worth spending at once. They are
 * held locally while being typed and sent together, because a scheme that sat
 * half saved for even a moment would be giving away the wrong amount of money.
 */
function LoyaltyCard({
  config, busy, onSave,
}: {
  config: PosSetup["config"]
  busy: boolean
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [per100, setPer100] = useState(String(config.loyaltyPointsPerHundred ?? 1))
  const [worth, setWorth] = useState(String(config.loyaltyShillingsPerPoint ?? 1))
  const [floor, setFloor] = useState(String(config.loyaltyMinRedeem ?? 50))

  const on = config.loyaltyEnabled === true
  const dirty =
    per100 !== String(config.loyaltyPointsPerHundred ?? 1) ||
    worth !== String(config.loyaltyShillingsPerPoint ?? 1) ||
    floor !== String(config.loyaltyMinRedeem ?? 50)

  // What the shop is promising, said back in the words a customer would use.
  // The arithmetic is the shop's own money, so it is better read off the
  // screen than worked out in somebody's head at the counter.
  const earnRate = Number(per100) || 0
  const pointWorth = Number(worth) || 0
  const spendPer100 = earnRate * pointWorth
  const backPct = spendPer100 > 0 ? spendPer100 : 0

  return (
    <Card className="p-4 rounded-2xl">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
          <Star className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Points for regulars</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            Customers who give their number earn points as they shop, then spend them off a
            later bill. Points come off as a discount, so your drawer still balances against
            what was actually taken.
          </p>
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={() => onSave({ loyaltyEnabled: !on })}
        className={
          on
            ? "mt-3 w-full flex items-center gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] disabled:opacity-60 border-primary bg-primary/5"
            : "mt-3 w-full flex items-center gap-2.5 p-3 rounded-xl border text-left active:scale-[0.99] disabled:opacity-60 border-gray-200 dark:border-gray-700"
        }
      >
        <span
          className={
            on
              ? "w-9 h-5 rounded-full bg-primary flex items-center px-0.5 flex-shrink-0 justify-end"
              : "w-9 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center px-0.5 flex-shrink-0"
          }
        >
          <span className="w-4 h-4 rounded-full bg-white block" />
        </span>
        <span className="min-w-0 flex-1 text-xs font-semibold text-gray-900 dark:text-white">
          {on ? "Running" : "Not running"}
        </span>
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />}
      </button>

      {on && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                Points per KSh 100 spent
              </span>
              <Input
                value={per100}
                onChange={(e) => setPer100(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="mt-1 h-11 rounded-xl text-sm tabular-nums"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                One point is worth (KSh)
              </span>
              <Input
                value={worth}
                onChange={(e) => setWorth(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="mt-1 h-11 rounded-xl text-sm tabular-nums"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              Fewest points that can be spent at once
            </span>
            <Input
              value={floor}
              onChange={(e) => setFloor(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="mt-1 h-11 rounded-xl text-sm tabular-nums"
            />
            <span className="block mt-1 text-[11px] text-gray-400 leading-snug">
              Stops a customer spending two points and holding up the queue. Zero allows any
              amount.
            </span>
          </label>

          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60">
            <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">
              What this promises
            </p>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              A customer spending KSh 100 earns {earnRate} point{earnRate === 1 ? "" : "s"},
              which they can later spend as KSh {spendPer100.toFixed(2)}. That is{" "}
              <span className="font-semibold text-gray-700 dark:text-gray-200">
                {backPct.toFixed(1)}% of takings
              </span>{" "}
              going back to your regulars.
            </p>
            {backPct > 10 && (
              <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 leading-snug">
                That is a large share of your margin. Most shops give back between 0.5% and 2%.
              </p>
            )}
          </div>

          <Button
            onClick={() =>
              onSave({
                loyaltyPointsPerHundred: Number(per100) || 0,
                loyaltyShillingsPerPoint: Number(worth) || 0,
                loyaltyMinRedeem: Math.floor(Number(floor) || 0),
              })
            }
            disabled={busy || !dirty}
            className="w-full h-11 rounded-xl text-xs"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? "Save the rates" : "Saved"}
          </Button>

          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
            Changing a rate affects points earned from now on. Points already held keep the
            value they were given, so nobody loses what they have already collected.
          </p>
        </div>
      )}
    </Card>
  )
}
