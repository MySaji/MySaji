"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { WorkspaceHeading, PosCard as Card } from "@/frontend/components/pos/workspace-ui"
import {
  ArrowLeft, AlertTriangle, Check, Loader2, Smartphone, ChevronDown, ChevronRight, ShieldCheck,
} from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { getShopMpesa, saveShopMpesa } from "@/backend/actions/pos-mpesa"

type Cfg = Awaited<ReturnType<typeof getShopMpesa>>

/**
 * Where a shop tells the till how it takes M-Pesa.
 *
 * Two sections, and the order matters. Almost every duka already has a
 * paybill or till number and needs nothing else: putting that number and the
 * exact amount on the screen is the whole win, and it takes one field. The
 * API details below it are for the minority who want to push a PIN prompt to
 * the customer's phone, and the page says plainly that it is optional.
 */
export default function TillMpesaPage() {
  const [cfg, setCfg] = useState<Cfg>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState("")

  const [shortcode, setShortcode] = useState("")
  const [kind, setKind] = useState<"PAYBILL" | "TILL">("PAYBILL")
  const [accountRef, setAccountRef] = useState("")

  const [showApi, setShowApi] = useState(false)
  const [consumerKey, setConsumerKey] = useState("")
  const [consumerSecret, setConsumerSecret] = useState("")
  const [passkey, setPasskey] = useState("")
  const [env, setEnv] = useState<"sandbox" | "production">("sandbox")

  useEffect(() => {
    getShopMpesa()
      .then((c) => {
        setCfg(c)
        if (c) {
          setShortcode(c.shortcode ?? "")
          setKind(c.shortcodeType ?? "PAYBILL")
          setAccountRef(c.accountRef ?? "")
          setEnv(c.env)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 2500) }

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true); setError("")
    const r = await saveShopMpesa({
      shortcode, shortcodeType: kind, accountRef, env,
      ...(consumerKey ? { consumerKey } : {}),
      ...(consumerSecret ? { consumerSecret } : {}),
      ...(passkey ? { passkey } : {}),
      ...extra,
    })
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setCfg(r.config)
    // Never hold a secret in component state longer than the request needs.
    setConsumerKey(""); setConsumerSecret(""); setPasskey("")
    flash("Saved")
  }

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (!cfg) {
    return (
      <div className="p-4 w-full min-w-0">
        <Card className="p-6 text-center rounded-2xl">
          <Smartphone className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
          <h1 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">No till on this account</h1>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 w-full min-w-0 space-y-5 pb-12">
      <div className="flex items-center gap-2">
        <Link
          href="/pos/settings"
          className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1 h-9 -ml-1 px-1 rounded-lg active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
      </div>
      <div>
        <WorkspaceHeading title="Taking M-Pesa" />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
          Money goes straight into your own M-Pesa. SAJI never holds it and never takes a cut
          of what you ring up at the counter.
        </p>
      </div>

      <Link href="/pos/payments" className="block rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">Open payments inbox & connect direct Paybill notifications<small className="mt-2 block text-xs font-normal">Cashiers can select received payments at checkout. Confirmed exact-amount prompts complete checkout and print automatically.</small></Link>
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

      {/* --- 1. the number on the wall ------------------------------------ */}
      <Card className="p-4 rounded-2xl">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">Your paybill or till number</h2>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          The till shows this to the customer with the exact amount, so nobody has to recite it
          or mistype it.
        </p>

        <div className="mt-3 flex gap-1.5">
          {(["PAYBILL", "TILL"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={
                kind === k
                  ? "flex-1 h-11 rounded-xl border text-xs font-semibold active:scale-95 border-primary bg-primary/10 text-primary"
                  : "flex-1 h-11 rounded-xl border text-xs font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
              }
            >
              {k === "PAYBILL" ? "Paybill" : "Till number"}
            </button>
          ))}
        </div>

        <div className="mt-2.5">
          <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
            {kind === "PAYBILL" ? "Paybill number" : "Till number"}
          </label>
          <Input
            value={shortcode}
            onChange={(e) => setShortcode(e.target.value.replace(/\D/g, "").slice(0, 9))}
            inputMode="numeric"
            placeholder="400200"
            className="mt-1 h-11 rounded-xl text-sm tabular-nums"
          />
        </div>

        {kind === "PAYBILL" && (
          <div className="mt-2.5">
            <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
              Account number customers should type
            </label>
            <Input
              value={accountRef}
              onChange={(e) => setAccountRef(e.target.value.slice(0, 40))}
              placeholder="Your shop name or account"
              className="mt-1 h-11 rounded-xl text-sm"
            />
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
              A till number does not need one. A paybill usually does.
            </p>
          </div>
        )}

        <Button onClick={() => save()} disabled={busy} className="mt-3 w-full h-11 rounded-xl text-sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
        </Button>
      </Card>

      {/* --- 2. prompting the customer ------------------------------------ */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-start gap-2.5">
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Smartphone className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Prompt the customer</h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Send a PIN request straight to their phone instead of reading out numbers. Optional,
              and it needs Daraja details from Safaricom.
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">
            {cfg.hasCredentials ? "API details are saved" : "No API details yet"}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
            {cfg.hasCredentials
              ? "Stored scrambled and never shown again. Enter them afresh to replace them."
              : "Get these from the Daraja portal, under your own app."}
          </p>
        </div>

        <button
          onClick={() => setShowApi((v) => !v)}
          className="mt-2 h-9 w-full inline-flex items-center justify-between px-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 active:scale-[0.99]"
        >
          {cfg.hasCredentials ? "Replace API details" : "Add API details"}
          {showApi ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showApi && (
          <div className="mt-1 space-y-2.5 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <Field label="Consumer key" value={consumerKey} onChange={setConsumerKey} />
            <Field label="Consumer secret" value={consumerSecret} onChange={setConsumerSecret} />
            <Field label="Passkey" value={passkey} onChange={setPasskey} />
            <div>
              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">Which Safaricom environment</label>
              <div className="mt-1 flex gap-1.5">
                {(["sandbox", "production"] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setEnv(e)}
                    aria-pressed={env === e}
                    className={
                      env === e
                        ? "flex-1 h-11 rounded-xl border text-xs font-semibold active:scale-95 border-primary bg-primary/10 text-primary"
                        : "flex-1 h-11 rounded-xl border text-xs font-semibold active:scale-95 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                    }
                  >
                    {e === "sandbox" ? "Sandbox (testing)" : "Live"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                Sandbox prompts move no real money. Switch to Live only once Safaricom has
                approved your app, or customers will be prompted for payments that never arrive.
              </p>
            </div>
            <Button onClick={() => save()} disabled={busy} className="w-full h-11 rounded-xl text-sm">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save API details"}
            </Button>
            <p className="flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Scrambled before they are stored and never sent back to a browser. Nobody at SAJI
              can read them.
            </p>
          </div>
        )}

        {/* The way out of the chicken and egg.
            A prompt needs Daraja credentials, and nobody registers with
            Safaricom for an app they have not watched work. This lets the
            whole flow be walked through first, and says in as many words
            that no money moves. */}
        {cfg.demoAvailable && (
          <button
            type="button"
            role="switch"
            aria-checked={cfg.usingDemoCreds}
            disabled={busy}
            onClick={() => save({ useDemoCreds: !cfg.usingDemoCreds })}
            className={`mt-3 w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all active:scale-[0.99] disabled:opacity-60 ${
              cfg.usingDemoCreds
                ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20"
                : "border-gray-200 dark:border-gray-700"
            }`}
          >
            <span className={`mt-0.5 w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${
              cfg.usingDemoCreds ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
            }`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cfg.usingDemoCreds ? "left-[18px]" : "left-0.5"}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-gray-900 dark:text-white">
                Try prompts without registering yet
              </span>
              <span className="block text-[11px] text-gray-600 dark:text-gray-300 leading-snug mt-0.5">
                Sends a real prompt to a phone through Safaricom&apos;s test system, so you can see
                exactly how it works before you apply for your own API details.
              </span>
              <span className="block text-[11px] font-semibold text-amber-800 dark:text-amber-400 leading-snug mt-1">
                No money moves, and nothing reaches your paybill. For trying it out only.
              </span>
            </span>
          </button>
        )}

        {cfg.usingDemoCreds && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-400 leading-snug">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            Test prompts are on. Switch this off and add your own API details before you take real
            money this way.
          </p>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={cfg.promptEnabled}
          disabled={busy}
          onClick={() => save({ promptEnabled: !cfg.promptEnabled })}
          className={`mt-3 w-full flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all active:scale-[0.99] disabled:opacity-60 ${
            cfg.promptEnabled ? "border-primary bg-primary/5" : "border-gray-200 dark:border-gray-700"
          }`}
        >
          <span className={`mt-0.5 w-9 h-5 rounded-full flex-shrink-0 relative transition-colors ${
            cfg.promptEnabled ? "bg-primary" : "bg-gray-300 dark:bg-gray-600"
          }`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cfg.promptEnabled ? "left-[18px]" : "left-0.5"}`} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-gray-900 dark:text-white">
              Let the till send prompts
            </span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5">
              {cfg.promptBlockedReason ?? "A Send prompt button appears on the payment screen."}
            </span>
          </span>
        </button>
      </Card>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug px-1">
        A code a cashier types in is recorded, not checked. A payment made through a prompt is
        confirmed by Safaricom, and the receipt says which it was.
      </p>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type="password"
        autoComplete="off"
        placeholder={"•".repeat(16)}
        className="mt-1 h-11 rounded-xl text-sm font-mono"
      />
    </div>
  )
}
