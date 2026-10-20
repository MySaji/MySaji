"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { AuthFrame } from "@/frontend/components/pos/auth-frame"
import { PasswordInput } from "@/frontend/components/pos/password-input"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { requestLoginOtp, verifyLoginOtp } from "@/backend/actions/otp"
import { posDestination } from "@/backend/actions/pos-onboarding"

/** Owners and employees use individual accounts; shared counters can also use PINs. */

const OTP_LENGTH = 6

export default function PosLoginPage() {
  const router = useRouter()
  const { login } = useAuthContext()
  const [step, setStep] = useState<"credentials" | "code">("credentials")
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState("")

  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""))
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const [sentTo, setSentTo] = useState("")
  const [fellBack, setFellBack] = useState(false)

  useEffect(() => { if (step === "code") boxes.current[0]?.focus() }, [step])

  const start = async () => {
    if (!identifier || !password) { setError("Enter your email or phone, and your password."); return }
    if (inFlight.current) return
    inFlight.current = true
    try {
      setBusy(true); setError("")
      const r = await requestLoginOtp(identifier, password)
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

  const finish = async (code: string) => {
    if (code.length !== OTP_LENGTH) return
    if (inFlight.current) return
    inFlight.current = true
    try {
      setBusy(true); setError("")
      const v = await verifyLoginOtp(identifier, code)
      if (!v.success) { setError(v.error); setDigits(Array(OTP_LENGTH).fill("")); boxes.current[0]?.focus(); return }
      const signedIn = await login(identifier, password, v.proof)
      if (!signedIn.success) { setError(signedIn.error); setStep("credentials"); return }
      // /pos decides where they land: it knows whether this account owns a
      // till, is staff on somebody's, or has neither, and sends them on. Going
      // straight to /pos/setup would have pushed a cashier into an owner's
      // wizard.
      router.push(await posDestination())
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const fill = (raw: string) => {
    const only = raw.replace(/\D/g, "").slice(0, OTP_LENGTH)
    if (!only) return
    const next = Array(OTP_LENGTH).fill("")
    for (let i = 0; i < only.length; i++) next[i] = only[i]
    setDigits(next)
    if (only.length === OTP_LENGTH) void finish(only)
    else boxes.current[only.length]?.focus()
  }

  return (
    <AuthFrame mode="login" step={step === "credentials" ? 0 : 1}>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy) void (step === "credentials" ? start() : finish(digits.join(""))) }} aria-busy={busy}>

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle aria-hidden="true" className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-red-700 leading-snug">{error}</p>
          </div>
        )}

        {step === "credentials" ? (
          <>
            <h1 className="mt-6 text-2xl font-bold text-gray-900 ">Welcome back.</h1>
            <p className="mt-1 text-sm text-gray-500 leading-relaxed">
              Sign in to your business workspace. Owners and employees use their own account.
            </p>

            <div className="mt-5 space-y-3">
              <div>
                <label htmlFor="pos-identifier" className="text-sm font-medium text-gray-700">Email or phone</label>
                <Input id="pos-identifier" placeholder="you@example.com or 0712 345 678" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="mt-1.5 h-12 rounded-xl text-base" autoComplete="username" />
              </div>
              <div>
                <label htmlFor="pos-password" className="text-sm font-medium text-gray-700">Password</label>
                <PasswordInput id="pos-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-12 rounded-xl text-base" autoComplete="current-password" />
              </div>
            </div>

            <Button type="submit" disabled={busy} className="mt-5 w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
            </Button>

            <div className="mt-5 rounded-xl border border-gray-200 p-3">
              <p className="text-xs font-semibold text-gray-900 ">Working the counter?</p>
              <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">
                Employees can sign in here using their own account. New employee? Activate your access first. A counter PIN is an alternative on a device already signed in by the shop.
              </p>
            </div>

            <Link href="/pos/employee" className="mt-4 block text-center text-sm font-semibold text-primary">Employee first-time signup</Link>
            <p className="mt-5 text-center text-xs text-gray-500 ">
              No till yet?{" "}
              <Link href="/pos/signup" className="font-semibold text-primary">Set one up</Link>
              {" · "}
              <Link href="/pos/contact" className="font-semibold text-primary">Talk to us</Link>
            </p>
          </>
        ) : (
          <>
            <button type="button" onClick={() => { setStep("credentials"); setError("") }} className="mt-5 h-9 -ml-1 px-1 inline-flex items-center gap-1 text-sm text-gray-500 active:scale-95">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <h1 className="mt-2 text-2xl font-bold text-gray-900 ">Enter the code</h1>
            <p className="mt-1 text-sm text-gray-500 ">Sent to {sentTo}.</p>

            {fellBack && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs text-amber-800 leading-snug">
                  We could not send a text just now, so the code went to the email on your account.
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
                    if (v.length > 1) { fill(v); return }
                    const next = [...digits]
                    next[i] = v
                    setDigits(next)
                    if (v && i < OTP_LENGTH - 1) boxes.current[i + 1]?.focus()
                    if (next.every((x) => x)) void finish(next.join(""))
                  }}
                  onKeyDown={(e) => { if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus() }}
                  onPaste={(e) => { e.preventDefault(); fill(e.clipboardData.getData("text")) }}
                  inputMode="numeric"
                  aria-label={`Verification digit ${i + 1}`}
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  disabled={busy}
                  maxLength={1}
                  className="w-11 h-14 rounded-xl border border-gray-200 bg-white text-center text-xl font-bold text-gray-900 tabular-nums"
                />
              ))}
            </div>

            <Button type="submit" disabled={busy || digits.some((d) => !d)} className="mt-5 w-full h-12 rounded-xl font-semibold">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign in"}
            </Button>
            <button type="button" onClick={start} disabled={busy} className="mt-3 w-full h-11 text-xs font-semibold text-gray-500 active:scale-95">
              Send it again
            </button>
          </>
        )}

      </form>
    </AuthFrame>
  )
}
