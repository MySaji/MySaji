"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Store, Loader2, AlertTriangle, ArrowRight, ArrowLeft, Check, Search,
  Settings as Cog, Package, Smartphone, Rocket, Upload, Keyboard, Camera, FlaskConical,
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { posProfilesByGroup } from "@/backend/domain/pos-profiles"
import { POS_TRAIT_META } from "@/backend/domain/pos-traits"
import {
  getOnboardingProgress, saveBusinessStep, acceptConfiguration,
  saveProductsStep, savePaymentsStep, completePosSetup, goToStep,
  type OnboardingProgress,
} from "@/backend/actions/pos-onboarding"
import { ONBOARDING_STEPS, type OnboardingStep } from "@/backend/domain/pos-onboarding-steps"

/**
 * The setup wizard.
 *
 * SAVES AFTER EVERY STEP, AND THAT IS THE POINT
 *
 * This is filled in on a phone, in a shop, between customers. The person
 * doing it will be interrupted. So each step writes what it knows before
 * moving on, and opening this page again lands exactly where they stopped
 * rather than at the beginning.
 *
 * STEP 3 SHOWS RATHER THAN ASKS
 *
 * Kenya, shillings, Nairobi time, one shop. Every one of those is the answer
 * a duka would give, so asking taxes ninety-nine shops to catch one. It is
 * shown so nothing is hidden, and all of it is changeable in settings later.
 */

const STEP_META: Record<OnboardingStep, { n: number; title: string; blurb: string; icon: typeof Store }> = {
  account: { n: 1, title: "Your account", blurb: "Done when you signed up", icon: Store },
  business: { n: 2, title: "About the shop", blurb: "Name, trade and where it is", icon: Store },
  configure: { n: 3, title: "How it is set up", blurb: "Kenya, shillings, one shop", icon: Cog },
  products: { n: 4, title: "What you sell", blurb: "Add stock now or later", icon: Package },
  payments: { n: 5, title: "Taking money", blurb: "Cash, M-Pesa and receipts", icon: Smartphone },
  golive: { n: 6, title: "Start trading", blurb: "A last look, then the till", icon: Rocket },
}

const ORDER: readonly OnboardingStep[] = ONBOARDING_STEPS

export default function PosSetupPage() {
  const router = useRouter()
  const [p, setP] = useState<OnboardingProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // step 2
  const [shopName, setShopName] = useState("")
  const [profileKey, setProfileKey] = useState("SUPERMARKET")
  const [profileSearch, setProfileSearch] = useState("")
  const [taxPin, setTaxPin] = useState("")
  const [regNo, setRegNo] = useState("")
  const [county, setCounty] = useState("")
  const [town, setTown] = useState("")
  const [street, setStreet] = useState("")
  const [shopPhone, setShopPhone] = useState("")

  // step 5
  const [shortcode, setShortcode] = useState("")
  const [shortcodeType, setShortcodeType] = useState<"PAYBILL" | "TILL">("PAYBILL")
  const [accountRef, setAccountRef] = useState("")
  const [footer, setFooter] = useState("")

  const refresh = async () => {
    const next = await getOnboardingProgress()
    setP(next)
    if (next) {
      const b = (next.data.business ?? {}) as Record<string, string>
      setShopName(b.name ?? next.businessName)
      setProfileKey(b.profileKey ?? next.profileKey ?? "SUPERMARKET")
      setTaxPin(b.taxPin ?? "")
      setRegNo(b.registrationNumber ?? "")
      setCounty(b.county ?? "")
      setTown(b.town ?? "")
      setStreet(b.street ?? "")
      setShopPhone(b.phone ?? "")
      const pay = (next.data.payments ?? {}) as Record<string, string>
      setShortcode(pay.mpesaShortcode ?? "")
      setShortcodeType((pay.mpesaShortcodeType as "PAYBILL" | "TILL") ?? "PAYBILL")
      setAccountRef(pay.mpesaAccountRef ?? "")
      setFooter(pay.receiptFooter ?? "")
    }
    return next
  }

  useEffect(() => {
    refresh()
      .then((next) => { if (next?.completed) router.replace("/provider/till/dashboard") })
      .finally(() => setLoading(false))
  }, [router])

  const step = p?.step ?? "business"

  const go = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true); setError("")
    const r = await fn()
    setBusy(false)
    if (!r.success) { setError(r.error ?? "That did not save."); return false }
    await refresh()
    return true
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></main>
  }

  if (!p) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">No till on this account</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Sign in with the account you created the till with, or start a new one.
          </p>
          <div className="mt-5 flex gap-2 justify-center">
            <Link href="/pos/login"><Button variant="outline" className="h-11 rounded-xl">Sign in</Button></Link>
            <Link href="/pos/signup"><Button className="h-11 rounded-xl">Set up a till</Button></Link>
          </div>
        </div>
      </main>
    )
  }

  const meta = STEP_META[step]
  const Icon = meta.icon

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-6">
      <div className="w-full max-w-lg mx-auto pb-16">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
            <Store className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{p.businessName}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Setting up your till</p>
          </div>
        </div>

        {/* The stepper. Answered steps can be gone back to; later ones cannot
            be jumped to, because each one builds on the last. */}
        <div className="mt-5 flex gap-1">
          {ORDER.map((s) => {
            const done = p.done.includes(s)
            const here = s === step
            const reachable = done || here
            return (
              <button
                key={s}
                disabled={!reachable || busy}
                onClick={() => void go(() => goToStep({ step: s }))}
                aria-current={here ? "step" : undefined}
                className="flex-1 group disabled:cursor-default"
                title={STEP_META[s].title}
              >
                <span className={`block h-1.5 rounded-full ${here ? "bg-primary" : done ? "bg-primary/50" : "bg-gray-200 dark:bg-gray-700"}`} />
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
          Step {meta.n} of 6 &middot; saved as you go
        </p>

        <div className="mt-4 flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">{meta.title}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{meta.blurb}</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
          </div>
        )}

        {/* ================= 2. the shop ================= */}
        {step === "business" && (
          <div className="mt-4 space-y-3">
            <Card className="p-4 rounded-2xl">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Shop name</label>
              <Input value={shopName} onChange={(e) => setShopName(e.target.value)} className="mt-1.5 h-12 rounded-xl text-base" />
              <p className="mt-1 text-[11px] text-gray-500">This is what prints on every receipt.</p>
            </Card>

            <Card className="p-4 rounded-2xl">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">What kind of shop is it?</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                This sets the till up for your trade. You can change any of it afterwards.
              </p>
              <div className="relative mt-2.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <Input value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)} placeholder="Search trades" className="h-11 pl-9 rounded-xl" />
              </div>
              <div className="mt-2.5 max-h-72 overflow-y-auto space-y-3 -mx-1 px-1">
                {posProfilesByGroup()
                  .map((g) => ({
                    ...g,
                    profiles: g.profiles.filter((pr) => {
                      const q = profileSearch.trim().toLowerCase()
                      return !q || pr.label.toLowerCase().includes(q) || pr.description.toLowerCase().includes(q)
                    }),
                  }))
                  .filter((g) => g.profiles.length > 0)
                  .map((g) => (
                    <div key={g.group}>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</p>
                      <div className="mt-1.5 space-y-1.5">
                        {g.profiles.map((pr) => {
                          const on = profileKey === pr.key
                          return (
                            <button
                              key={pr.key}
                              onClick={() => setProfileKey(pr.key)}
                              aria-pressed={on}
                              className={`w-full p-3 rounded-xl border text-left active:scale-[0.99] ${
                                on ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
                              }`}
                            >
                              <span className="block text-sm font-semibold text-gray-900 dark:text-white">{pr.label}</span>
                              <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">{pr.description}</span>
                              {on && pr.traits.length > 0 && (
                                <span className="mt-2 block text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
                                  <span className="font-medium">Switches on:</span>{" "}
                                  {pr.traits.map((t) => POS_TRAIT_META[t].label).join(" · ")}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            </Card>

            <Card className="p-4 rounded-2xl space-y-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Where it is</p>
              <div className="grid grid-cols-2 gap-2">
                <Input value={county} onChange={(e) => setCounty(e.target.value)} placeholder="County" className="h-11 rounded-xl text-sm" />
                <Input value={town} onChange={(e) => setTown(e.target.value)} placeholder="Town" className="h-11 rounded-xl text-sm" />
              </div>
              <Input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street or estate" className="h-11 rounded-xl text-sm" />
              <Input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} inputMode="tel" placeholder="Shop phone" className="h-11 rounded-xl text-sm" />
            </Card>

            <Card className="p-4 rounded-2xl space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Registration and tax</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Optional now. A shop that has not registered yet still needs to sell today.
                </p>
              </div>
              <Input value={regNo} onChange={(e) => setRegNo(e.target.value)} placeholder="Business registration number" className="h-11 rounded-xl text-sm" />
              <Input value={taxPin} onChange={(e) => setTaxPin(e.target.value.toUpperCase())} placeholder="KRA PIN" className="h-11 rounded-xl text-sm font-mono" />
            </Card>

            <Button
              onClick={() => go(() => saveBusinessStep({
                name: shopName, profileKey,
                registrationNumber: regNo || undefined, taxPin: taxPin || undefined,
                county: county || undefined, town: town || undefined,
                street: street || undefined, phone: shopPhone || undefined,
              }))}
              disabled={busy || shopName.trim().length < 2}
              className="w-full h-12 rounded-xl font-semibold"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </div>
        )}

        {/* ================= 3. configuration ================= */}
        {step === "configure" && (
          <div className="mt-4 space-y-3">
            <Card className="p-4 rounded-2xl">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                These are set the way almost every Kenyan shop needs them. Nothing here is hidden
                from you, and all of it can be changed in settings later.
              </p>
              <div className="mt-3 space-y-0.5">
                <Setting label="Country" value="Kenya" />
                <Setting label="Currency" value="Kenya shillings (KES)" />
                <Setting label="Time zone" value="Nairobi" />
                <Setting label="Shops" value="One, for now" />
                <Setting label="Stock tracking" value="On" />
                <Setting label="Barcode scanning" value="On, scanner or camera" />
                <Setting label="Expiry and batches" value="On where the trade needs it" />
                <Setting label="Low stock alerts" value="On" />
                <Setting label="Offline selling" value="On" />
                <Setting label="Cashier shifts" value="On" />
              </div>
            </Card>
            <Button onClick={() => go(() => acceptConfiguration())} disabled={busy} className="w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Looks right <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </div>
        )}

        {/* ================= 4. products ================= */}
        {step === "products" && (
          <div className="mt-4 space-y-3">
            <Card className="p-4 rounded-2xl">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                You have {p.productCount === 0 ? "nothing" : p.productCount + (p.productCount === 1 ? " product" : " products")} in the
                catalogue. You can skip this and add things as you sell them, which is how most
                small shops start.
              </p>
              <div className="mt-3 space-y-2">
                <Choice
                  href="/provider/till/stock"
                  icon={Upload}
                  title="Import a spreadsheet"
                  blurb="A CSV or Excel file of what you sell."
                />
                <Choice
                  href="/provider/till/stock"
                  icon={Camera}
                  title="Scan the barcodes"
                  blurb="Point the camera at each item and name it."
                />
                <Choice
                  href="/provider/till/stock"
                  icon={Keyboard}
                  title="Type them in"
                  blurb="Name, price and how many you have."
                />
              </div>
            </Card>

            <div className="flex gap-2">
              <Button
                onClick={() => go(() => saveProductsStep({ method: "skip" }))}
                variant="outline"
                disabled={busy}
                className="h-12 rounded-xl px-4 text-sm"
              >
                Skip for now
              </Button>
              <Button
                onClick={() => go(() => saveProductsStep({ method: p.productCount > 0 ? "manual" : "skip" }))}
                disabled={busy}
                className="flex-1 h-12 rounded-xl font-semibold"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4 ml-1" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* ================= 5. payments ================= */}
        {step === "payments" && (
          <div className="mt-4 space-y-3">
            <Card className="p-4 rounded-2xl">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600" strokeWidth={3} />
                <p className="text-sm font-semibold text-gray-900 dark:text-white">Cash is on</p>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">
                With change worked out for you, and rounding if your prices need it.
              </p>
            </Card>

            <Card className="p-4 rounded-2xl space-y-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Your M-Pesa</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  The till shows this to the customer with the exact amount, so nobody recites it.
                </p>
              </div>
              <div className="flex gap-1.5">
                {(["PAYBILL", "TILL"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setShortcodeType(k)}
                    aria-pressed={shortcodeType === k}
                    className={
                      shortcodeType === k
                        ? "flex-1 h-11 rounded-xl border text-xs font-semibold border-primary bg-primary/10 text-primary active:scale-95"
                        : "flex-1 h-11 rounded-xl border text-xs font-semibold border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 active:scale-95"
                    }
                  >
                    {k === "PAYBILL" ? "Paybill" : "Till number"}
                  </button>
                ))}
              </div>
              <Input
                value={shortcode}
                onChange={(e) => setShortcode(e.target.value.replace(/\D/g, "").slice(0, 9))}
                inputMode="numeric"
                placeholder={shortcodeType === "PAYBILL" ? "Paybill number" : "Till number"}
                className="h-11 rounded-xl text-sm tabular-nums"
              />
              {shortcodeType === "PAYBILL" && (
                <Input value={accountRef} onChange={(e) => setAccountRef(e.target.value)} placeholder="Account number customers type" className="h-11 rounded-xl text-sm" />
              )}
              <p className="text-[11px] text-gray-500 leading-snug">
                Leave it blank if you do not have one yet. Sending a prompt to the customer&apos;s
                phone is set up later, in settings.
              </p>
            </Card>

            <Card className="p-4 rounded-2xl">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Receipt footer</label>
              <Input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Thank you, karibu tena" className="mt-1.5 h-11 rounded-xl text-sm" />
              <p className="mt-1 text-[11px] text-gray-500 leading-snug">
                Receipts print to a thermal printer automatically, with a print button when it
                does not come out.
              </p>
            </Card>

            <Button
              onClick={() => go(() => savePaymentsStep({
                acceptCash: true,
                mpesaShortcode: shortcode || undefined,
                mpesaShortcodeType: shortcodeType,
                mpesaAccountRef: accountRef || undefined,
                receiptFooter: footer || undefined,
              }))}
              disabled={busy}
              className="w-full h-12 rounded-xl font-semibold"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </div>
        )}

        {/* ================= 6. go live ================= */}
        {step === "golive" && (
          <div className="mt-4 space-y-3">
            <Card className="p-4 rounded-2xl">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Where things stand</p>
              <div className="mt-2.5 space-y-1.5">
                <Item done label="Account created and verified" />
                <Item done label={"Shop set up as " + (p.data.business as { profileKey?: string } | undefined)?.profileKey?.toLowerCase().replace(/_/g, " ")} />
                <Item
                  done={p.productCount > 0}
                  label={p.productCount > 0 ? p.productCount + " products ready" : "No products yet"}
                  note={p.productCount > 0 ? undefined : "You can add them as you sell."}
                />
                <Item
                  done={p.hasPayment}
                  label={p.hasPayment ? "M-Pesa number saved" : "No M-Pesa number"}
                  note={p.hasPayment ? undefined : "Cash still works."}
                />
                <Item done label="Till works without internet" />
              </div>
              <p className="mt-3 text-[11px] text-gray-500 leading-snug">
                Nothing above has to be ticked. A shop can open with cash and an empty catalogue
                and fill both in as it trades.
              </p>
            </Card>

            <Button
              onClick={async () => {
                const ok = await go(() => completePosSetup())
                if (ok) router.push("/provider/till/dashboard")
              }}
              disabled={busy}
              className="w-full h-12 rounded-xl font-semibold"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Rocket className="w-4 h-4 mr-1.5" /> Open my till</>}
            </Button>
          </div>
        )}

        {step !== "business" && (
          <button
            onClick={() => {
              const i = ORDER.indexOf(step)
              if (i > 1) void go(() => goToStep({ step: ORDER[i - 1] }))
            }}
            disabled={busy}
            className="mt-3 w-full h-11 inline-flex items-center justify-center gap-1 text-xs font-semibold text-gray-500 active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back a step
          </button>
        )}
      </div>
    </main>
  )
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-xs font-semibold text-gray-900 dark:text-white text-right">{value}</span>
    </div>
  )
}

function Item({ done, label, note }: { done: boolean; label?: string; note?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
        done ? "bg-emerald-500 text-white" : "border-2 border-gray-300 dark:border-gray-600"
      }`}>
        {done && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-gray-900 dark:text-white capitalize">{label}</span>
        {note && <span className="block text-[11px] text-gray-500 leading-snug">{note}</span>}
      </span>
    </div>
  )
}

function Choice({ href, icon: Icon, title, blurb }: { href: string; icon: typeof Upload; title: string; blurb: string }) {
  return (
    <Link href={href} className="block">
      <span className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 active:scale-[0.99]">
        <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
          <span className="block text-[11px] text-gray-500 leading-snug">{blurb}</span>
        </span>
        <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
      </span>
    </Link>
  )
}
