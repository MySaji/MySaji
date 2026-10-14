"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Store, Loader2, AlertTriangle, ArrowRight, ArrowLeft, ShieldCheck, Check,
} from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { sendSignupOtp, verifySignupOtp } from "@/backend/actions/otp"
import { createPosAccount } from "@/backend/actions/pos-onboarding"
import { useAuthContext } from "@/frontend/lib/auth-context"

/**
 * Signing up for a till, and nothing else.
 *
 * WHY THIS IS NOT THE SAJI SIGNUP
 *
 * A shopkeeper who wants a till is not shopping for a marketplace portal.
 * The main signup asks which Saji Pro business types they hold and who runs
 * their business, which are the right questions for a provider and noise for
 * a supermarket. This page asks four things and then gets out of the way.
 *
 * The account it creates is a real account on the same database, so a shop
 * that later wants to sell on SAJI loses nothing. It simply is not asked
 * about it today.
 */

const OTP_LENGTH = 6

type Step = "details" | "code" | "password"

export default function PosSignupPage() {
  const router = useRouter()
  const { login } = useAuthContext()
  const [step, setStep] = useState<Step>("details")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const [businessName, setBusinessName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [agree, setAgree] = useState(false)

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""))
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const [sentTo, setSentTo] = useState("")
  const [fellBack, setFellBack] = useState(false)
  const [proof, setProof] = useState("")

  useEffect(() => { if (step === "code") boxes.current[0]?.focus() }, [step])

  const checks = {
    length: password.length >= 8,
    mix: /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password),
    case: /[A-Z]/.test(password) && /[a-z]/.test(password),
  }

  const sendCode = async () => {
    if (businessName.trim().length < 2) { setError("What is the shop called?"); return }
    if (name.trim().length < 2) { setError("Your name, so receipts can say who served."); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("That email does not look right."); return }
    if (!/^\d{9,15}$/.test(phone.replace(/^\+/, ""))) { setError("That phone number does not look right."); return }

    setBusy(true); setError("")
    // Sent to the phone, falling back to the email this form already has.
    // The server decides which, and tells us which it used.
    const r = await sendSignupOtp(phone, email)
    setBusy(false)
    if (!r.success) { setError(r.error); return }
    setSentTo(r.destination)
    setFellBack(r.fellBackToEmail)
    setDigits(Array(OTP_LENGTH).fill(""))
    setStep("code")
  }

  const submitCode = async (code: string) => {
    if (code.length !== OTP_LENGTH) return
    setBusy(true); setError("")
    const r = await verifySignupOtp(sentTo || phone, code)
    setBusy(false)
    if (!r.success) { setError(r.error); setDigits(Array(OTP_LENGTH).fill("")); boxes.current[0]?.focus(); return }
    setProof(r.proof)
    setStep("password")
  }

  const finish = async () => {
    if (!checks.length || !checks.mix || !checks.case) { setError("Use at least 8 characters, with a capital, a small letter and a number."); return }
    if (password !== confirm) { setError("The two passwords are different."); return }
    if (!agree) { setError("Please agree to the terms to continue."); return }

    setBusy(true); setError("")
    const r = await createPosAccount({
      name, email, phone, password, agreeTerms: true,
      verificationProof: proof, businessName,
    })
    if (!r.success) { setBusy(false); setError(r.error); return }

    // Straight into the wizard, signed in. Making somebody log in again
    // immediately after creating an account is a step with no purpose.
    const signedIn = await login(email, password)
    setBusy(false)
    router.push(signedIn.success ? "/pos/setup" : "/pos/login")
  }

  const fillDigits = (raw: string) => {
    const only = raw.replace(/\D/g, "").slice(0, OTP_LENGTH)
    if (!only) return
    const next = Array(OTP_LENGTH).fill("")
    for (let i = 0; i < only.length; i++) next[i] = only[i]
    setDigits(next)
    if (only.length === OTP_LENGTH) void submitCode(only)
    else boxes.current[only.length]?.focus()
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-950 px-4 py-8">
      <div className="w-full max-w-md mx-auto">
        <div className="flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center">
            <Store className="w-5 h-5" />
          </span>
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">Saji Till</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Point of sale for Kenyan shops</p>
          </div>
        </div>

        <div className="mt-6 flex gap-1.5">
          {(["details", "code", "password"] as Step[]).map((s, i) => {
            const at = ["details", "code", "password"].indexOf(step)
            return <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= at ? "bg-primary" : "bg-gray-200 dark:bg-gray-700"}`} />
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-300 leading-snug">{error}</p>
          </div>
        )}

        {/* ---------- 1. who and what ---------- */}
        {step === "details" && (
          <div className="mt-5">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Set up your till</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Four things now, and you can be selling in a few minutes.
            </p>

            {/* An employee who lands here would otherwise create a second,
                empty business of their own and wonder why none of their
                employer's products are in it. Said at the top, before they
                start typing, because after four fields it is too late. */}
            <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3">
              <p className="text-xs font-semibold text-foreground">Were you added by your employer?</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Do not set up a till here. Sign in with the email or phone your
                employer used when they added you, and their shop opens for you
                automatically.
              </p>
              <Link
                href="/pos/login"
                className="mt-2 inline-flex h-9 px-3 rounded-lg bg-background border border-border text-xs font-semibold text-foreground items-center active:scale-95"
              >
                Sign in instead
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              <Field label="What is the shop called?" hint="This goes on your receipts.">
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Mama Njeri Supermarket" className="h-12 rounded-xl text-base" />
              </Field>
              <Field label="Your name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Njeri Kamau" className="h-12 rounded-xl text-base" autoComplete="name" />
              </Field>
              <Field label="Phone number" hint="We send a code here to check it is you.">
                <div className="flex items-center gap-2">
                  <span className="h-12 px-3 rounded-xl border border-gray-200 dark:border-gray-700 inline-flex items-center text-sm text-gray-500 flex-shrink-0">+254</span>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="tel" placeholder="712345678" className="h-12 rounded-xl text-base tabular-nums" />
                </div>
              </Field>
              <Field label="Email">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" className="h-12 rounded-xl text-base" autoComplete="email" />
              </Field>
            </div>

            <Button onClick={sendCode} disabled={busy} className="mt-5 w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>

            <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
              Already have a till?{" "}
              <Link href="/pos/login" className="font-semibold text-primary">Sign in</Link>
              {" · "}
              <Link href="/pos/contact" className="font-semibold text-primary">Talk to us</Link>
            </p>
          </div>
        )}

        {/* ---------- 2. the code ---------- */}
        {step === "code" && (
          <div className="mt-5">
            <button onClick={() => { setStep("details"); setError("") }} className="h-9 -ml-1 px-1 inline-flex items-center gap-1 text-sm text-gray-500 active:scale-95">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Enter the code</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Sent to {sentTo || phone}.
            </p>

            {fellBack && (
              <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                  We could not send a text just now, so the code went to your email instead.
                  Nothing is wrong with your number.
                </p>
              </div>
            )}

            <div className="mt-5 flex gap-2 justify-between">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { boxes.current[i] = el }}
                  value={d}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "")
                    if (v.length > 1) { fillDigits(v); return }
                    const next = [...digits]
                    next[i] = v
                    setDigits(next)
                    if (v && i < OTP_LENGTH - 1) boxes.current[i + 1]?.focus()
                    if (next.every((x) => x)) void submitCode(next.join(""))
                  }}
                  onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus() }}
                  onPaste={(e) => { e.preventDefault(); fillDigits(e.clipboardData.getData("text")) }}
                  inputMode="numeric"
                  maxLength={1}
                  className="w-12 h-14 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-center text-xl font-bold text-gray-900 dark:text-white tabular-nums"
                />
              ))}
            </div>

            <Button onClick={() => void submitCode(digits.join(""))} disabled={busy || digits.some((d) => !d)} className="mt-5 w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </Button>
            <button onClick={sendCode} disabled={busy} className="mt-3 w-full h-11 text-xs font-semibold text-gray-500 active:scale-95">
              Send it again
            </button>
          </div>
        )}

        {/* ---------- 3. a password ---------- */}
        {step === "password" && (
          <div className="mt-5">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Choose a password</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              This is for you, the owner. Your staff will use short PINs at the till instead.
            </p>

            <div className="mt-5 space-y-3">
              <Field label="Password">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="h-12 rounded-xl text-base" autoComplete="new-password" />
              </Field>
              <div className="space-y-1">
                <Rule ok={checks.length} text="At least 8 characters" />
                <Rule ok={checks.mix} text="A number or a symbol" />
                <Rule ok={checks.case} text="A capital and a small letter" />
              </div>
              <Field label="Type it again">
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" className="h-12 rounded-xl text-base" autoComplete="new-password" />
              </Field>
            </div>

            <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300" />
              <span className="text-xs text-gray-600 dark:text-gray-300 leading-snug">
                I agree to the{" "}
                <Link href="/terms" className="text-primary font-medium">Terms</Link> and{" "}
                <Link href="/privacy" className="text-primary font-medium">Privacy Policy</Link>.
              </span>
            </label>

            <Button onClick={finish} disabled={busy} className="mt-5 w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create my till"}
            </Button>

            <p className="mt-4 flex items-start gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Your sales and stock belong to you. Nobody at Saji can read your password.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</label>
      {hint && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`}>
      <Check className={`w-3.5 h-3.5 ${ok ? "" : "opacity-30"}`} strokeWidth={3} />
      {text}
    </p>
  )
}
