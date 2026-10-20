"use client"

import React from "react"
import { Suspense, useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { Mail, Lock, Eye, EyeOff, Apple, Phone, Shield, Info, Loader2, ShieldCheck, CheckCircle2 } from "lucide-react"
import { Checkbox } from "@/frontend/components/ui/checkbox"
import { ROLE_HOME_PATH } from "@/backend/services/role-map"
import { BrandLogo } from "@/frontend/components/brand-logo"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { requestLoginOtp, verifyLoginOtp } from "@/backend/actions/otp"
import { useOtpAutofill } from "@/frontend/lib/hooks/useOtpAutofill"
import { AuthWelcomePanel, AuthJourney } from "@/frontend/components/auth/auth-welcome-panel"
import { AuthMobileHeader } from "@/frontend/components/auth/auth-mobile-header"

const OTP_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 25

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, loginWithGoogle } = useAuthContext()
  const { t } = useLocalization()
  const [step, setStep] = useState<"credentials" | "otp">("credentials")
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("phone")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [otpDestination, setOtpDestination] = useState("")
  /** True when the text could not be sent and the code went to email instead. */
  const [otpFellBackToEmail, setOtpFellBackToEmail] = useState(false)
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""))
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const SESSION_NOTICE: Record<string, string> = {
    inactivity: t("authPage.login.sessionExpired"),
    "tab-closed": t("authPage.login.tabClosed"),
  }

  // NextAuth appends these to its own sign-in page (pages.signIn = "/auth/login")
  // on an OAuth failure. Without this map the page just silently redirects back
  // here with e.g. ?error=OAuthAccountNotLinked and no explanation — most
  // commonly hit when someone who already signed up with email/password tries
  // "Continue with Google" using that same email; NextAuth correctly refuses to
  // auto-link the two (linking on unverified email match is a real account-
  // takeover vector) but gives no UI feedback of its own.
  const OAUTH_ERROR_MESSAGE: Record<string, string> = {
    OAuthAccountNotLinked: t("authPage.login.oauthAccountNotLinked"),
    AccessDenied: t("authPage.login.oauthAccessDenied"),
    GoogleAccountExists: t("authPage.login.oauthGoogleAccountExists"),
    GoogleAccountNotFound: t("authPage.login.oauthGoogleAccountNotFound"),
  }
  const OAUTH_ERROR_FALLBACK = t("authPage.login.oauthFallback")
  const sessionNotice = SESSION_NOTICE[searchParams.get("reason") ?? ""]

  React.useEffect(() => {
    const oauthError = searchParams.get("error")
    if (oauthError) setError(OAUTH_ERROR_MESSAGE[oauthError] ?? OAUTH_ERROR_FALLBACK)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  const identifier = loginMethod === "email" ? email : phone
  const isEmailValid = loginMethod === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  /**
   * Where to go once they are in.
   *
   * A shop's own till address sends people here with ?next=/pos/sell so
   * they land at the register rather than the dashboard.
   *
   * Only a path on this site is honoured. Anything else — an absolute URL, a
   * protocol-relative "//evil.example" — is dropped, because a login page
   * that will forward you anywhere after authenticating is a phishing tool
   * wearing our name.
   */
  const safeNext = (() => {
    const raw = searchParams.get("next")
    if (!raw) return null
    if (!raw.startsWith("/") || raw.startsWith("//")) return null
    return raw
  })()

  const completeSignIn = async (proof: string) => {
    try {
      setIsLoading(true)
      const result = await login(identifier, password, proof)
      setIsLoading(false)
      if (!result.success) {
        setError(result.error)
        setStep("credentials")
        return
      }
      router.push(safeNext ?? ROLE_HOME_PATH[result.role])
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmitCredentials = async (e: React.FormEvent) => {
    try {
      e.preventDefault()
      setError("")
      if (!identifier || !password) { setError(t("authPage.errors.fillAllFields")); return }
      setIsLoading(true)
      const result = await requestLoginOtp(identifier, password)
      setIsLoading(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      setOtpDestination(result.destination)
      setOtpFellBackToEmail(result.fellBackToEmail)
      setOtpDigits(Array(OTP_LENGTH).fill(""))
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      setStep("otp")
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1)
    const next = [...otpDigits]
    next[index] = digit
    setOtpDigits(next)
    if (digit && index < OTP_LENGTH - 1) otpInputRefs.current[index + 1]?.focus()
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[index] && index > 0) otpInputRefs.current[index - 1]?.focus()
  }

  const submitOtpCode = async (code: string) => {
    try {
      if (code.length !== OTP_LENGTH) { setError(t("authPage.login.enterFullCode")); return }
      setError("")
      setIsLoading(true)
      const result = await verifyLoginOtp(identifier, code)
      if (!result.success) {
        setIsLoading(false)
        setError(result.error)
        return
      }
      await completeSignIn(result.proof)
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Shared by paste and WebOTP autofill — fills every box at once (rather
  // than only landing the last digit in whichever box happened to be
  // focused) and, once a full code has actually arrived, submits it
  // immediately instead of waiting for a manual tap on Verify.
  const fillOtpDigits = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, OTP_LENGTH)
    if (!digits) return
    const next = Array(OTP_LENGTH).fill("")
    for (let i = 0; i < digits.length; i++) next[i] = digits[i]
    setOtpDigits(next)
    if (digits.length === OTP_LENGTH) {
      otpInputRefs.current[OTP_LENGTH - 1]?.blur()
      submitOtpCode(digits)
    } else {
      otpInputRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus()
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    fillOtpDigits(e.clipboardData.getData("text"))
  }

  useOtpAutofill(step === "otp", fillOtpDigits)

  const handleVerifyOtp = () => submitOtpCode(otpDigits.join(""))

  const handleResendOtp = async () => {
    try {
      if (resendCooldown > 0) return
      setError("")
      setIsLoading(true)
      const result = await requestLoginOtp(identifier, password)
      setIsLoading(false)
      if (!result.success) { setError(result.error); return }
      setOtpDestination(result.destination)
      setOtpFellBackToEmail(result.fellBackToEmail)
      setOtpDigits(Array(OTP_LENGTH).fill(""))
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      otpInputRefs.current[0]?.focus()
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true)
      // Read by auth.ts's signIn callback once Google's redirect comes back,
      // so a Google account with no existing SAJI account can be rejected
      // with "sign up first" instead of silently creating one from the login
      // button.
      document.cookie = "oauth_intent=login; path=/; max-age=300; samesite=lax"
      const result = await loginWithGoogle(ROLE_HOME_PATH.customer)
      setIsLoading(false)
      if (!result.success) {
        setError(result.error)
        return
      }
      window.location.href = result.url
    } catch {
      setError("Could not connect. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAppleLogin = () => {
    setError(t("authPage.login.appleNotSetup"))
  }

  return (
    <div className="auth-screen min-h-screen">
    <div className="auth-frame">
      <AuthWelcomePanel mode="login" />

      {/* Right Panel -- form */}
      <div className="auth-form-panel">
        {/* Subtle decorative accents so the wide-screen white space reads as
            intentional rather than empty -- echoes the left panel's orbs at
            far lower opacity, blurred and behind the form so it never
            competes with legibility. */}
        <div className="hidden lg:block absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="hidden lg:block absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="auth-form-card">
          <AuthMobileHeader showBack={step === "credentials"} />
          <AuthJourney mode="login" step={step} />

          {step === "credentials" && (
            <div className="flex items-start justify-between gap-3 mb-6 lg:hidden">
              <div className="flex flex-col items-start gap-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <BrandLogo size="large" />
                  <span className="text-2xl font-bold text-foreground">SAJI</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("authPage.tagline")}</p>
              </div>

            </div>
          )}

          {step === "credentials" ? (
            <>
              <h2 className="text-2xl font-bold text-foreground mb-1">{t("authPage.login.welcomeBack")}</h2>
              <p className="text-sm text-muted-foreground mb-6">{t("authPage.login.accessAccount")}</p>

              {/* Session notice */}
              {!error && sessionNotice && (
                <div className="mb-4 p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {sessionNotice}
                </div>
              )}

              {/* Error */}
              {error && (
                <div role="alert" className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              {/* Method tabs */}
              <div className="flex rounded-xl bg-muted/50 p-1 mb-5">
                {(["email", "phone"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setLoginMethod(m)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                      loginMethod === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "email" ? <Mail className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                    {m === "email" ? t("auth.email") : t("authPage.login.phoneTab")}
                  </button>
                ))}
              </div>

              {/* Form */}
              <form onSubmit={handleSubmitCredentials} className="space-y-4">
                {/* Credential */}
                <div>
                  <label htmlFor="credential" className="text-sm font-medium text-foreground mb-1.5 block">
                    {loginMethod === "email" ? t("authPage.login.emailAddress") : t("authPage.login.phoneNumber")}
                  </label>
                  <div className="relative">
                    {loginMethod === "email" ? (
                      <>
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input autoComplete="username" id="credential" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9 pr-9 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                        {isEmailValid && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />}
                      </>
                    ) : (
                      <>
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input id="credential" type="tel" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-9 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                      </>
                    )}
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="text-sm font-medium text-foreground mb-1.5 block">{t("auth.password")}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input autoComplete="current-password" id="password" type={showPassword ? "text" : "password"} placeholder={t("authPage.login.enterPassword")} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-9 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                    <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors" disabled={isLoading}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Remember + Forgot */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={rememberMe} onCheckedChange={(checked) => setRememberMe(checked === true)} disabled={isLoading} />
                    <span className="text-sm text-muted-foreground">{t("auth.rememberMe")}</span>
                  </label>
                  <Link href="/auth/forgot-password" className="text-sm font-medium text-primary hover:underline">
                    {t("auth.forgotPassword")}
                  </Link>
                </div>

                {/* Submit */}
                <Button type="submit" disabled={isLoading} className="w-full h-10 rounded-xl font-semibold gap-2">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {isLoading ? t("authPage.login.signingIn") : t("auth.login")}
                </Button>
              </form>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">{t("authPage.orContinueWith")}</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Social */}
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <Button type="button" onClick={handleGoogleLogin} disabled={isLoading} variant="outline" className="h-10 rounded-xl bg-card gap-2 text-xs sm:text-sm font-medium px-2">
                  <svg width="16" height="16" viewBox="0 0 48 48" className="flex-shrink-0"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.64-.15-3.21-.43-4.73H24v9.01h12.4c-.54 2.91-2.18 5.38-4.65 7.04l7.2 5.59c4.21-3.88 6.65-9.6 6.65-16.91z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.2-5.59c-2 1.35-4.56 2.15-8.7 2.15-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  <span className="truncate">{t("authPage.continueWithGoogle")}</span>
                </Button>
                <Button type="button" onClick={handleAppleLogin} disabled={isLoading} className="h-10 rounded-xl gap-2 text-xs sm:text-sm font-medium bg-foreground text-background hover:bg-foreground/90 px-2">
                  <Apple className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{t("authPage.continueWithApple")}</span>
                </Button>
              </div>

              {/* Security note */}
              <div className="mt-5 p-3 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                {t("authPage.securityNote")}
              </div>

              {/* Footer links */}
              <p className="text-center text-sm text-muted-foreground mt-6">
                {t("authPage.login.noAccount")}{" "}
                <Link href="/auth/signup" className="font-semibold text-primary hover:underline">{t("authPage.login.signUpLink")}</Link>
                <span className="mx-2 text-border">|</span>
                <button onClick={() => router.push("/")} className="font-medium text-primary hover:underline">{t("authPage.homepage")}</button>
              </p>
            </>
          ) : (
            <>
              <button onClick={() => { setStep("credentials"); setError("") }} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1" disabled={isLoading}>
                &larr; {t("authPage.back")}
              </button>
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                <ShieldCheck className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-1">
                {t((otpFellBackToEmail || otpDestination.includes("@")) ? "authPage.otp.verifyEmailTitle" : "authPage.otp.verifyPhoneTitle")}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">{t("authPage.otp.codeSentTo", { destination: otpDestination })}</p>
              {/* The code went somewhere other than the number they signed in
                  with. Saying nothing would look like it never arrived. */}
              {otpFellBackToEmail && (
                <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-left">
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                    We could not send a text message just now, so the code went to the email on
                    your account instead.
                  </p>
                </div>
              )}

              {error && (
                <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
              )}

              <div className="flex gap-2 sm:gap-3 mb-5 justify-between">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpInputRefs.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    onPaste={handleOtpPaste}
                    autoComplete="one-time-code"
                    disabled={isLoading}
                    className="w-11 h-12 sm:w-12 sm:h-14 rounded-xl border border-border bg-card text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                ))}
              </div>

              <Button onClick={handleVerifyOtp} disabled={isLoading || otpDigits.join("").length !== OTP_LENGTH} className="w-full h-10 rounded-xl font-semibold gap-2 mb-4">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("authPage.otp.verifyAndContinue")}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {resendCooldown > 0 ? (
                  t("authPage.otp.resendIn", { seconds: String(resendCooldown).padStart(2, "0") })
                ) : (
                  <button onClick={handleResendOtp} disabled={isLoading} className="font-semibold text-primary hover:underline">{t("authPage.otp.resendCode")}</button>
                )}
              </p>

              <p className="text-center text-xs text-muted-foreground mt-6 flex items-center justify-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> {t("authPage.otp.infoSecure")}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
