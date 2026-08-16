"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthContext } from "@/lib/auth-context"
import {
  Mail, Lock, User, ArrowRight, Eye, EyeOff, Apple, ArrowLeft, Sparkles, Shield, Clock, Phone,
  HardHat, Store, Building2, Loader2, ShieldCheck, CheckCircle2, Circle,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import type { UserRole } from "@/lib/types"
import { ROLE_HOME_PATH } from "@/lib/role-map"
import { registerUser } from "@/lib/actions/auth"
import { sendSignupOtp, verifySignupOtp } from "@/lib/actions/otp"
import { BrandLogo } from "@/components/brand-logo"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

const OTP_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 25

type SignupStep = "role" | "details" | "otp" | "password" | "success"

const ROLE_CARDS: { role: UserRole; icon: typeof User; iconBg: string; iconColor: string; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { role: "customer", icon: User, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", iconColor: "text-emerald-600 dark:text-emerald-400", titleKey: "authPage.signup.roleCardCustomerTitle", descKey: "authPage.signup.roleCardCustomerDesc" },
  { role: "provider", icon: HardHat, iconBg: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400", titleKey: "authPage.signup.roleCardProviderTitle", descKey: "authPage.signup.roleCardProviderDesc" },
  { role: "shopkeeper", icon: Store, iconBg: "bg-amber-100 dark:bg-amber-900/30", iconColor: "text-amber-600 dark:text-amber-400", titleKey: "authPage.signup.roleCardShopkeeperTitle", descKey: "authPage.signup.roleCardShopkeeperDesc" },
  { role: "distributor", icon: Building2, iconBg: "bg-purple-100 dark:bg-purple-900/30", iconColor: "text-purple-600 dark:text-purple-400", titleKey: "authPage.signup.roleCardDistributorTitle", descKey: "authPage.signup.roleCardDistributorDesc" },
]

const ROLE_NEXT_PATH: Record<UserRole, string> = {
  ...ROLE_HOME_PATH,
  provider: "/provider/onboarding",
  shopkeeper: "/shopkeeper/register",
  distributor: "/distributor/register",
}

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login, loginWithGoogle } = useAuthContext()
  const { t } = useLocalization()
  const [step, setStep] = useState<SignupStep>("role")
  const [signupMethod, setSignupMethod] = useState<"phone" | "email">("phone")
  const [formData, setFormData] = useState({
    role: "customer" as UserRole,
    name: "", email: "", phone: "", password: "", confirmPassword: "",
    agreeTerms: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""))
  const [resendCooldown, setResendCooldown] = useState(0)
  const [verificationProof, setVerificationProof] = useState("")
  const [nextPath, setNextPath] = useState(ROLE_HOME_PATH.customer)
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [resendCooldown])

  const handleChange = (field: string, value: string | boolean) => setFormData((prev) => ({ ...prev, [field]: value }))

  const primaryIdentifier = signupMethod === "phone" ? formData.phone : formData.email

  const handleSelectRole = (role: UserRole) => {
    handleChange("role", role)
    setStep("details")
  }

  const validateDetails = () => {
    if (!formData.name || !formData.email || !formData.phone) { setError(t("authPage.errors.fillAllFields")); return false }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) { setError(t("authPage.signup.invalidEmail")); return false }
    if (!/^\d{9,15}$/.test(formData.phone.replace(/^\+/, ""))) { setError(t("authPage.signup.invalidPhone")); return false }
    return true
  }

  const handleSubmitDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!validateDetails()) return
    setIsLoading(true)
    const result = await sendSignupOtp(primaryIdentifier)
    setIsLoading(false)
    if (!result.success) { setError(result.error); return }
    setOtpDigits(Array(OTP_LENGTH).fill(""))
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
    setStep("otp")
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

  // Pasting the whole code (from a messaging app, password manager, or the
  // OS's own "copy code from SMS" suggestion) anywhere in the box group
  // fills every box at once instead of only landing the last digit in
  // whichever box happened to be focused.
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH)
    if (!pasted) return
    e.preventDefault()
    const next = Array(OTP_LENGTH).fill("")
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setOtpDigits(next)
    otpInputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus()
  }

  const handleVerifyOtp = async () => {
    const code = otpDigits.join("")
    if (code.length !== OTP_LENGTH) { setError(t("authPage.login.enterFullCode")); return }
    setError("")
    setIsLoading(true)
    const result = await verifySignupOtp(primaryIdentifier, code)
    setIsLoading(false)
    if (!result.success) { setError(result.error); return }
    setVerificationProof(result.proof)
    setStep("password")
  }

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return
    setError("")
    setIsLoading(true)
    const result = await sendSignupOtp(primaryIdentifier)
    setIsLoading(false)
    if (!result.success) { setError(result.error); return }
    setOtpDigits(Array(OTP_LENGTH).fill(""))
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
    otpInputRefs.current[0]?.focus()
  }

  const passwordChecks = {
    length: formData.password.length >= 8,
    numberOrSymbol: /[0-9]/.test(formData.password) || /[^A-Za-z0-9]/.test(formData.password),
    caseMix: /[A-Z]/.test(formData.password) && /[a-z]/.test(formData.password),
  }

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (!formData.password || !formData.confirmPassword) { setError(t("authPage.errors.fillAllFields")); return }
    if (!passwordChecks.length || !passwordChecks.numberOrSymbol || !passwordChecks.caseMix) { setError(t("authPage.errors.passwordMin8")); return }
    if (formData.password !== formData.confirmPassword) { setError(t("authPage.errors.passwordsMismatch")); return }
    if (!formData.agreeTerms) { setError(t("authPage.signup.agreeTermsError")); return }

    setIsLoading(true)
    try {
      const result = await registerUser({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: formData.role,
        verificationProof,
        referralCode: searchParams.get("ref") || undefined,
      })

      if (!result.success) {
        setError(result.error)
        setIsLoading(false)
        return
      }

      const loginResult = await login(formData.email, formData.password)
      setIsLoading(false)

      if (!loginResult.success) {
        // Account was created but automatic sign-in failed; let them log in manually.
        router.push("/auth/login")
        return
      }

      setNextPath(ROLE_NEXT_PATH[loginResult.role])
      setStep("success")
    } catch {
      setError(t("authPage.signup.registrationError"))
      setIsLoading(false)
    }
  }

  const handleGoogleSignup = async () => {
    setIsLoading(true)
    // Read by auth.ts's signIn callback once Google's redirect comes back,
    // so a Google account that already has a SAJI account can be rejected
    // with "sign in instead" rather than silently logging the existing user
    // in from the signup button.
    document.cookie = "oauth_intent=signup; path=/; max-age=300; samesite=lax"
    const result = await loginWithGoogle(ROLE_HOME_PATH.customer)
    setIsLoading(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    window.location.href = result.url
  }

  const handleAppleSignup = () => {
    setError(t("authPage.signup.appleNotSetup"))
  }

  const STEP_ORDER: SignupStep[] = ["role", "details", "otp", "password"]
  const stepIndex = STEP_ORDER.indexOf(step)

  return (
    <div className="min-h-screen flex justify-center bg-muted/20">
    <div className="flex w-full max-w-[1360px] bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col relative overflow-hidden bg-primary text-primary-foreground p-10">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-white/5 blur-3xl" />

        <div className="relative z-10 flex items-center gap-3">
          <BrandLogo size="large" variant="translucent" />
          <span className="text-xl font-bold tracking-tight">SAJI</span>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center gap-12">
          <div>
            <h1 className="text-3xl font-bold leading-tight mb-3">{t("authPage.signup.joinToday")}</h1>
            <p className="text-white/70 text-sm leading-relaxed max-w-xs">{t("authPage.signup.joinTodaySubtitle")}</p>
          </div>

          <div className="space-y-5">
            {[
              { icon: Sparkles, title: t("authPage.signup.feature1Title"), desc: t("authPage.signup.feature1Desc") },
              { icon: Shield, title: t("authPage.signup.feature2Title"), desc: t("authPage.signup.feature2Desc") },
              { icon: Clock, title: t("authPage.signup.feature3Title"), desc: t("authPage.signup.feature3Desc") },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{item.title}</p>
                  <p className="text-white/60 text-xs">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-white/40 text-xs">&copy; {new Date().getFullYear()} SAJI. {t("authPage.login.allRightsReserved")}</p>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:px-8 relative overflow-hidden">
        <div className="hidden lg:block absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="hidden lg:block absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-primary/5 blur-3xl" />
        <div className="w-full max-w-[420px] relative z-10">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <BrandLogo />
            <span className="text-lg font-bold text-foreground">SAJI</span>
          </div>

          {step !== "success" && step !== "role" && (
            <div className="flex gap-2 mb-5">
              {STEP_ORDER.slice(1).map((s) => (
                <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(s) ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
          )}

          {error && step !== "role" && (
            <div className="mb-4 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>
          )}

          {/* Step: role */}
          {step === "role" && (
            <>
              <h2 className="text-2xl font-bold text-foreground mb-1">{t("authPage.signup.howWillYouUse")}</h2>
              <p className="text-sm text-muted-foreground mb-6">{t("authPage.signup.howWillYouUseSubtitle")}</p>
              <div className="space-y-3">
                {ROLE_CARDS.map(({ role, icon: Icon, iconBg, iconColor, titleKey, descKey }) => (
                  <button
                    key={role}
                    onClick={() => handleSelectRole(role)}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl border border-border bg-card hover:border-primary hover:shadow-sm transition-all text-left"
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                      <Icon className={`w-5 h-5 ${iconColor}`} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground text-sm">{t(titleKey)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t(descKey)}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
              <p className="text-center text-sm text-muted-foreground mt-6">
                {t("authPage.signup.alreadyHaveAccount")} <Link href="/auth/login" className="font-semibold text-primary hover:underline">{t("authPage.signup.signIn")}</Link>
              </p>
            </>
          )}

          {/* Step: details (name/email/phone) */}
          {step === "details" && (
            <>
              <h2 className="text-2xl font-bold text-foreground mb-1">{t("authPage.signup.createAccount")}</h2>
              <p className="text-sm text-muted-foreground mb-5">{t("authPage.signup.letsGetStarted")}</p>

              <div className="flex rounded-xl bg-muted/50 p-1 mb-5">
                {(["phone", "email"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSignupMethod(m)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
                      signupMethod === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "phone" ? <Phone className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                    {m === "phone" ? t("authPage.login.phoneTab") : t("auth.email")}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmitDetails} className="space-y-4">
                <div>
                  <label htmlFor="name" className="text-sm font-medium text-foreground mb-1.5 block">{t("authPage.signup.fullName")}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="name" type="text" placeholder={t("authPage.signup.fullNamePlaceholder")} value={formData.name} onChange={(e) => handleChange("name", e.target.value)} className="pl-9 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                  </div>
                </div>
                <div>
                  <label htmlFor="phone" className="text-sm font-medium text-foreground mb-1.5 block">{t("authPage.signup.phoneNumber")}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+254</span>
                    <Input id="phone" type="tel" placeholder="712345678" value={formData.phone} onChange={(e) => handleChange("phone", e.target.value)} className="pl-12 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                  </div>
                </div>
                <div>
                  <label htmlFor="email" className="text-sm font-medium text-foreground mb-1.5 block">{t("authPage.signup.emailAddress")}</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="email" type="email" placeholder="you@example.com" value={formData.email} onChange={(e) => handleChange("email", e.target.value)} className="pl-9 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {signupMethod === "phone" ? t("authPage.signup.otpWillGoToPhone") : t("authPage.signup.otpWillGoToEmail")}
                </p>
                <div className="flex gap-3">
                  <Button type="button" onClick={() => setStep("role")} disabled={isLoading} variant="outline" className="h-10 rounded-xl bg-transparent gap-1 px-4">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <Button type="submit" disabled={isLoading} className="flex-1 h-10 rounded-xl font-semibold gap-2">
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>{t("authPage.signup.nextStep")} <ArrowRight className="w-4 h-4" /></>}
                  </Button>
                </div>
              </form>

              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">{t("authPage.orContinueWith")}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button type="button" onClick={handleGoogleSignup} disabled={isLoading} variant="outline" className="h-10 rounded-xl bg-card gap-2 text-sm font-medium">
                  <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.64-.15-3.21-.43-4.73H24v9.01h12.4c-.54 2.91-2.18 5.38-4.65 7.04l7.2 5.59c4.21-3.88 6.65-9.6 6.65-16.91z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.2-5.59c-2 1.35-4.56 2.15-8.7 2.15-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  Google
                </Button>
                <Button type="button" onClick={handleAppleSignup} disabled={isLoading} className="h-10 rounded-xl gap-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90">
                  <Apple className="w-4 h-4" /> Apple
                </Button>
              </div>
            </>
          )}

          {/* Step: otp */}
          {step === "otp" && (
            <>
              <button onClick={() => { setStep("details"); setError("") }} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1" disabled={isLoading}>
                &larr; {t("authPage.back")}
              </button>
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                <ShieldCheck className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-1">{t("authPage.otp.verifyPhoneTitle")}</h2>
              <p className="text-sm text-muted-foreground mb-6">{t("authPage.otp.codeSentTo", { destination: primaryIdentifier })}</p>

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

          {/* Step: password */}
          {step === "password" && (
            <>
              <h2 className="text-2xl font-bold text-foreground mb-1">{t("authPage.signup.setUpAccount")}</h2>
              <p className="text-sm text-muted-foreground mb-5">{t("authPage.signup.setUpAccountSubtitle")}</p>

              <form onSubmit={handleSubmitPassword} className="space-y-4">
                <div>
                  <label htmlFor="name2" className="text-sm font-medium text-foreground mb-1.5 block">{t("authPage.signup.fullName")}</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="name2" type="text" value={formData.name} onChange={(e) => handleChange("name", e.target.value)} className="pl-9 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className="text-sm font-medium text-foreground mb-1.5 block">{t("auth.password")}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="password" type={showPassword ? "text" : "password"} placeholder={t("authPage.signup.passwordMinPlaceholder")} value={formData.password} onChange={(e) => handleChange("password", e.target.value)} className="pl-9 pr-9 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" disabled={isLoading}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="mt-2.5 space-y-1.5">
                    {[
                      { ok: passwordChecks.length, label: t("authPage.signup.checkLength") },
                      { ok: passwordChecks.numberOrSymbol, label: t("authPage.signup.checkNumberOrSymbol") },
                      { ok: passwordChecks.caseMix, label: t("authPage.signup.checkCaseMix") },
                    ].map((c) => (
                      <div key={c.label} className={`flex items-center gap-1.5 text-xs ${c.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                        {c.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                        {c.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="confirm" className="text-sm font-medium text-foreground mb-1.5 block">{t("authPage.signup.confirmPassword")}</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input id="confirm" type={showConfirm ? "text" : "password"} placeholder={t("authPage.signup.reenterPasswordPlaceholder")} value={formData.confirmPassword} onChange={(e) => handleChange("confirmPassword", e.target.value)} className="pl-9 pr-9 h-10 rounded-xl border-border bg-card" disabled={isLoading} />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" disabled={isLoading}>
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <Checkbox checked={formData.agreeTerms} onCheckedChange={(c) => handleChange("agreeTerms", c as boolean)} disabled={isLoading} className="mt-0.5" />
                  <span className="text-xs text-muted-foreground leading-relaxed">
                    {t("authPage.signup.agreeTermsPrefix")} <Link href="/terms" className="text-primary hover:underline">{t("authPage.signup.termsOfService")}</Link> {t("authPage.signup.and")} <Link href="/privacy" className="text-primary hover:underline">{t("authPage.signup.privacyPolicy")}</Link>
                  </span>
                </label>
                <div className="flex gap-3">
                  <Button type="button" onClick={() => setStep("otp")} disabled={isLoading} variant="outline" className="h-10 rounded-xl bg-transparent gap-1 px-4">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <Button type="submit" disabled={isLoading} className="flex-1 h-10 rounded-xl font-semibold">
                    {isLoading ? t("authPage.signup.creating") : t("authPage.signup.createAccount")}
                  </Button>
                </div>
              </form>
            </>
          )}

          {/* Step: success */}
          {step === "success" && (
            <div className="text-center py-4">
              <div className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">{t("authPage.signup.welcomeToSaji")}</h2>
              <p className="text-sm text-muted-foreground mb-8">{t("authPage.signup.accountCreatedDesc")}</p>
              <Button onClick={() => router.push(nextPath)} className="w-full h-10 rounded-xl font-semibold gap-2">
                {t("authPage.signup.continueButton")} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  )
}
