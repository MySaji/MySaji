"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import {
  Loader2, AlertTriangle, ArrowRight, ArrowLeft, ShieldCheck, Check,
} from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { sendSignupOtp, verifySignupOtp } from "@/backend/actions/otp"
import { createPosEmployeeAccount } from "@/backend/actions/pos-employee"
import { createPosAccount } from "@/backend/actions/pos-onboarding"
import { AuthFrame } from "@/frontend/components/pos/auth-frame"
import { PasswordInput } from "@/frontend/components/pos/password-input"

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
  const employee = usePathname() === "/pos/employee"
  const [step, setStep] = useState<Step>("details")
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
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
    if (!employee && businessName.trim().length < 2) { setError("What is the shop called?"); return }
    if (name.trim().length < 2) { setError("Your name, so receipts can say who served."); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("That email does not look right."); return }
    if (!employee && !/^\d{9,15}$/.test(phone.replace(/^\+/, ""))) { setError("That phone number does not look right."); return }

    if (inFlight.current) return
    inFlight.current = true
    try {
      setBusy(true); setError("")
      // Sent to the phone, falling back to the email this form already has.
      // The server decides which, and tells us which it used.
      const r = await sendSignupOtp(employee ? email.trim().toLowerCase() : phone, employee ? undefined : email)
      if (!r.success) { setError(r.error); return }
      setSentTo(r.destination)
      setFellBack(r.fellBackToEmail)
      setDigits(Array(OTP_LENGTH).fill(""))
      setStep("code")
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const submitCode = async (code: string) => {
    if (code.length !== OTP_LENGTH) return
    if (inFlight.current) return
    inFlight.current = true
    try {
      setBusy(true); setError("")
      const r = await verifySignupOtp(sentTo || phone, code)
      if (!r.success) { setError(r.error); setDigits(Array(OTP_LENGTH).fill("")); boxes.current[0]?.focus(); return }
      setProof(r.proof)
      setStep("password")
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const finish = async () => {
    if (!checks.length || !checks.mix || !checks.case) { setError("Use at least 8 characters, with a capital, a small letter and a number."); return }
    if (password !== confirm) { setError("The two passwords are different."); return }
    if (!agree) { setError("Please agree to the terms to continue."); return }

    if (inFlight.current) return
    inFlight.current = true
    try {
      setBusy(true); setError("")
      const r = await (employee ? createPosEmployeeAccount : createPosAccount)({
        name, email, phone, password, agreeTerms: true,
        verificationProof: proof, businessName,
      })
      if (!r.success) { setError(r.error); return }
  
      router.push("/pos/login")
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      inFlight.current = false
      setBusy(false)
    }
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
    <AuthFrame mode={employee ? "employee" : "owner"} step={["details", "code", "password"].indexOf(step)}>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy) void (step === "details" ? sendCode() : step === "code" ? submitCode(digits.join("")) : finish()) }} aria-busy={busy}>


        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700 leading-snug">{error}</p>
          </div>
        )}

        {/* ---------- 1. who and what ---------- */}
        {step === "details" && (
          <div className="mt-5">
            <h1 className="text-2xl font-bold text-gray-900 ">{employee ? "Activate employee access" : "Set up your till"}</h1>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              {employee ? "Verify the email your employer added to Team, then create your own password. Your employer controls your store, role and features." : "Start with your shop details. Then verify your contact and choose a password."}
            </p>

            {/* An employee who lands here would otherwise create a second,
                empty business of their own and wonder why none of their
                employer's products are in it. Said at the top, before they
                start typing, because after four fields it is too late. */}
            {!employee && <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3">
              <p className="text-xs font-semibold text-foreground">Were you added by your employer?</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Use employee signup to activate your invited email. Your employer chooses the shop and features you can access.
              </p>
              <Link
                href="/pos/employee"
                className="mt-2 inline-flex h-9 px-3 rounded-lg bg-background border border-border text-xs font-semibold text-foreground items-center active:scale-95"
              >
                Activate employee access
              </Link>
            </div>}

            <div className="mt-5 space-y-3">
              {!employee && <>              <Field label="What is the shop called?" hint="This goes on your receipts.">
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Mama Njeri Supermarket" className="h-12 rounded-xl text-base" />
              </Field></>}
              <Field label="Your name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Njeri Kamau" className="h-12 rounded-xl text-base" autoComplete="name" />
              </Field>
              {!employee && <>              <Field label="Phone number" hint="We send a code here to check it is you.">
                <div className="flex items-center gap-2">
                  <span className="h-12 px-3 rounded-xl border border-gray-200 inline-flex items-center text-sm text-gray-500 flex-shrink-0">+254</span>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="tel" placeholder="712345678" className="h-12 rounded-xl text-base tabular-nums" />
                </div>
              </Field></>}
              <Field label="Email">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@example.com" className="h-12 rounded-xl text-base" autoComplete="email" />
              </Field>
            </div>

            <Button type="submit" disabled={busy} className="mt-5 w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>

            <p className="mt-4 text-center text-xs text-gray-500 ">
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
            <button type="button" onClick={() => { setStep("details"); setError("") }} className="h-9 -ml-1 px-1 inline-flex items-center gap-1 text-sm text-gray-500 active:scale-95">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="mt-2 text-2xl font-bold text-gray-900 ">Enter the code</h1>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              Sent to {sentTo || phone}.
            </p>

            {fellBack && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs text-amber-800 leading-snug">
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
                  aria-label={`Verification digit ${i + 1}`}
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  disabled={busy}
                  maxLength={1}
                  className="w-12 h-14 rounded-xl border border-gray-200 bg-white text-center text-xl font-bold text-gray-900 tabular-nums"
                />
              ))}
            </div>

            <Button type="submit" disabled={busy || digits.some((d) => !d)} className="mt-5 w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </Button>
            <button type="button" onClick={sendCode} disabled={busy} className="mt-3 w-full h-11 text-xs font-semibold text-gray-500 active:scale-95">
              Send it again
            </button>
          </div>
        )}

        {/* ---------- 3. a password ---------- */}
        {step === "password" && (
          <div className="mt-5">
            <h1 className="text-2xl font-bold text-gray-900 ">Choose a password</h1>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              {employee ? "After activation, sign in to Till with your verified email and password." : "You’re nearly there. Choose a password for your owner account, then sign in to set up your shop."}
            </p>

            <div className="mt-5 space-y-3">
              <Field label="Password">
                <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 rounded-xl text-base" autoComplete="new-password" />
              </Field>
              <div className="space-y-1">
                <Rule ok={checks.length} text="At least 8 characters" />
                <Rule ok={checks.mix} text="A number or a symbol" />
                <Rule ok={checks.case} text="A capital and a small letter" />
              </div>
              <Field label="Type it again">
                <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-12 rounded-xl text-base" autoComplete="new-password" />
              </Field>
            </div>

            <label className="mt-4 flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-gray-300" />
              <span className="text-xs text-gray-600 leading-snug">
                I agree to the{" "}
                <Link href="/terms" className="text-primary font-medium">Terms</Link> and{" "}
                <Link href="/privacy" className="text-primary font-medium">Privacy Policy</Link>.
              </span>
            </label>

            <Button type="submit" disabled={busy} className="mt-5 w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : employee ? "Activate my employee account" : "Create my till"}
            </Button>

            <p className="mt-4 flex items-start gap-1.5 text-[11px] text-gray-500 leading-snug">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {employee ? "Your employer sets your permissions. Keep your password and verification codes private." : "Your sales and stock belong to you. Nobody at Saji can read your password."}
            </p>
          </div>
        )}
      </form>
    </AuthFrame>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

function Rule({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-emerald-600 " : "text-gray-400"}`}>
      <Check className={`w-3.5 h-3.5 ${ok ? "" : "opacity-30"}`} strokeWidth={3} />
      {text}
    </p>
  )
}
