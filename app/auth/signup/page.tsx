"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { useAuthContext } from "@/frontend/lib/auth-context"
import {
  Mail, Lock, User, ArrowRight, Eye, EyeOff, Apple, ArrowLeft, Sparkles, Shield, Clock, Phone,
  HardHat, Store, Building2, Loader2, ShieldCheck, CheckCircle2, Circle, Check,
  Wrench, Package, Laptop, GraduationCap, Briefcase, Users, Crown,
  Calculator, Lock as LockIcon, Search,
} from "lucide-react"
import { Checkbox } from "@/frontend/components/ui/checkbox"
import type { UserRole } from "@/backend/domain/types"
import { ROLE_HOME_PATH } from "@/backend/services/role-map"
import { registerUser } from "@/backend/actions/auth"
import { sendSignupOtp, verifySignupOtp } from "@/backend/actions/otp"
import { useOtpAutofill } from "@/frontend/lib/hooks/useOtpAutofill"
import { BrandLogo } from "@/frontend/components/brand-logo"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import type { TranslationKey } from "@/backend/domain/i18n"
import { AuthMobileHeader } from "@/frontend/components/auth/auth-mobile-header"
import { AuthHeroIllustration } from "@/frontend/components/auth/auth-hero-illustration"
import {
  PRO_BUSINESS_TYPES, PRO_BUSINESS_TYPE_META, isTypeSelectable, hasPos,
  type ProBusinessType,
} from "@/backend/domain/pro-modules"
import { POS_PROFILES, posProfilesByGroup, DEFAULT_POS_PROFILE_KEY } from "@/backend/domain/pos-profiles"
import { POS_TRAIT_META } from "@/backend/domain/pos-traits"
import { POS_PROFILE_ICON } from "@/frontend/components/pos/pos-profile-icons"

const OTP_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 25

// posShopType appears only for an account that picked POS. It is a real
// step rather than a control inside proSetup because thirty-five options do
// not fit beside the six business types without burying both.
type SignupStep = "role" | "proSetup" | "posShopType" | "details" | "otp" | "password" | "success"
type ProviderType = "solo" | "business"

/**
 * Three ways in, not four.
 *
 * "Professional" and "Merchant" used to be separate cards leading to separate
 * portals, which forced anyone who both worked and sold to keep two accounts.
 * They are now one card — Saji Pro — and what the account actually does is
 * answered on the next step as a multi-select. The underlying `role` stays
 * `provider`, so every route guard, session claim and redirect behaves exactly
 * as before; a Saji Pro who ticks "Sell Products" gets a ShopkeeperProfile
 * created alongside, which is what lights up the merchant pages in the one
 * shared portal.
 */
const ROLE_CARDS: { role: UserRole; icon: typeof User; iconBg: string; iconColor: string; titleKey: TranslationKey; descKey: TranslationKey }[] = [
  { role: "customer", icon: User, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", iconColor: "text-emerald-600 dark:text-emerald-400", titleKey: "authPage.signup.roleCardCustomerTitle", descKey: "authPage.signup.roleCardCustomerDesc" },
  { role: "provider", icon: Crown, iconBg: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-600 dark:text-blue-400", titleKey: "authPage.signup.roleCardProviderTitle", descKey: "authPage.signup.roleCardProviderDesc" },
  { role: "distributor", icon: Building2, iconBg: "bg-purple-100 dark:bg-purple-900/30", iconColor: "text-purple-600 dark:text-purple-400", titleKey: "authPage.signup.roleCardDistributorTitle", descKey: "authPage.signup.roleCardDistributorDesc" },
]

/** Icon per business type, resolved from the registry's icon name. */
const BUSINESS_TYPE_ICON: Record<string, typeof User> = {
  Wrench, Store, Package, Laptop, GraduationCap, Briefcase, Calculator,
}

const BUSINESS_TYPE_ACCENT: Record<string, string> = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

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
  /** Filters the thirty-five shop types. Thirty-five is too many to scan. */
  const [posSearch, setPosSearch] = useState("")
  const [formData, setFormData] = useState({
    role: "customer" as UserRole,
    providerType: null as ProviderType | null,
    businessTypes: [] as ProBusinessType[],
    /** Which of the thirty-five shop presets a POS account picked. */
    posProfileKey: null as string | null,
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

  /**
   * Where the code was actually sent, which is not always what was asked for.
   *
   * If a text cannot be sent — our SMS account, never the applicant — the
   * server falls back to the email this same form already collected and says
   * so here. The verify call must then use THIS, not the phone number, or we
   * would refuse a code we emailed ourselves.
   */
  const [otpSentTo, setOtpSentTo] = useState("")
  const [otpFellBackToEmail, setOtpFellBackToEmail] = useState(false)

  const handleSelectRole = (role: UserRole) => {
    handleChange("role", role)
    // Saji Pro says up front what it does and whether it's one person or a
    // team, both on one screen — everyone else goes straight to details as
    // before.
    setStep(role === "provider" ? "proSetup" : "details")
  }

  const toggleBusinessType = (type: ProBusinessType) => {
    const selected = formData.businessTypes
    // Un-ticking is always allowed; it can only ever resolve a conflict.
    if (!selected.includes(type)) {
      const { selectable, reason } = isTypeSelectable(type, selected)
      if (!selectable) {
        // Say why. The card is already dimmed, but a dimmed control that
        // does nothing when tapped reads as a broken app on a phone, where
        // there is no hover to reveal the tooltip.
        setError(reason ?? "")
        return
      }
    }
    setError("")
    setFormData((prev) => {
      const next = prev.businessTypes.includes(type)
        ? prev.businessTypes.filter((t) => t !== type)
        : [...prev.businessTypes, type]
      return {
        ...prev,
        businessTypes: next,
        // Dropping POS drops the shop type with it, so backing out and
        // choosing Services does not quietly carry a butchery preset along.
        posProfileKey: hasPos(next) ? prev.posProfileKey : null,
      }
    })
  }

  const selectPosProfile = (key: string) => {
    setError("")
    setFormData((prev) => ({ ...prev, posProfileKey: key }))
  }

  const handlePosShopTypeContinue = () => {
    if (!formData.posProfileKey) {
      setError(t("authPage.signup.posShopTypeSelectOne"))
      return
    }
    setError("")
    setStep("details")
  }

  const handleSelectProviderType = (type: ProviderType) => {
    setFormData((prev) => ({ ...prev, providerType: type }))
  }

  const handleProSetupContinue = () => {
    if (formData.businessTypes.length === 0) {
      setError(t("authPage.signup.proSetupSelectOne"))
      return
    }
    setError("")
    // A till has to know what trade it is serving before it is any use, so
    // the shop type is asked here rather than left to a settings page the
    // shopkeeper may never open.
    if (hasPos(formData.businessTypes)) {
      setFormData((prev) => ({ ...prev, providerType: prev.providerType ?? "solo" }))
      setStep("posShopType")
      return
    }
    // Solo is the overwhelmingly common case, so it is the default rather
    // than a required extra tap.
    setFormData((prev) => ({ ...prev, providerType: prev.providerType ?? "solo" }))
    setStep("details")
  }

  // Once account creation succeeds, a provider carries their Solo/Business
  // choice forward as a query param so /provider/onboarding can skip
  // straight to the right step instead of asking again.
  const resolveNextPath = (role: UserRole) => {
    if (role === "provider" && formData.providerType) {
      return `/provider/onboarding?type=${formData.providerType}`
    }
    return ROLE_NEXT_PATH[role]
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
    const result = await sendSignupOtp(primaryIdentifier, formData.email)
    setIsLoading(false)
    if (!result.success) { setError(result.error); return }
    setOtpSentTo(result.destination)
    setOtpFellBackToEmail(result.fellBackToEmail)
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

  const submitOtpCode = async (code: string) => {
    if (code.length !== OTP_LENGTH) { setError(t("authPage.login.enterFullCode")); return }
    setError("")
    setIsLoading(true)
    const result = await verifySignupOtp(otpSentTo || primaryIdentifier, code)
    setIsLoading(false)
    if (!result.success) { setError(result.error); return }
    setVerificationProof(result.proof)
    setStep("password")
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
    if (resendCooldown > 0) return
    setError("")
    setIsLoading(true)
    const result = await sendSignupOtp(primaryIdentifier, formData.email)
    setIsLoading(false)
    if (!result.success) { setError(result.error); return }
    setOtpSentTo(result.destination)
    setOtpFellBackToEmail(result.fellBackToEmail)
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
        businessTypes: formData.role === "provider" ? formData.businessTypes : undefined,
        posProfileKey: formData.role === "provider" && hasPos(formData.businessTypes)
          ? (formData.posProfileKey ?? DEFAULT_POS_PROFILE_KEY)
          : undefined,
        verificationProof,
        referralCode: searchParams.get("ref") || undefined,
      })

      if (!result.success) {
        setError(result.error)
        setIsLoading(false)
        return
      }

      setIsLoading(false)
      router.push("/auth/login")
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
    // Which role card they picked. auth.ts validates this against a fixed
    // allowlist before using it, so a hand-edited cookie cannot grant a role.
    document.cookie = `oauth_role=${formData.role}; path=/; max-age=300; samesite=lax`
    // The Saji Pro business types ticked on the proSetup step, so a Google
    // signup provisions the same ProCapability rows a credentials signup
    // does. auth.ts filters this against a fixed allowlist before using it.
    document.cookie = `oauth_pro_types=${formData.businessTypes.join(",")}; path=/; max-age=300; samesite=lax`
    // Carried the same way as the types: the OAuth round trip loses component
    // state, and a POS account that came back without its shop type would be
    // provisioned as General with no way to tell that was not a choice.
    if (hasPos(formData.businessTypes)) {
      document.cookie = `oauth_pos_profile=${formData.posProfileKey ?? DEFAULT_POS_PROFILE_KEY}; path=/; max-age=300; samesite=lax`
    }
    // resolveNextPath, not ROLE_HOME_PATH: a provider must reach
    // /provider/onboarding (carrying the Solo/Business choice already made
    // above), a shopkeeper /shopkeeper/register, and so on. Sending them to
    // the dashboard skips account setup entirely, which is what this used to do.
    const result = await loginWithGoogle(resolveNextPath(formData.role))
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

  const STEP_ORDER: SignupStep[] = ["role", "proSetup", "posShopType", "details", "otp", "password"]
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
          <AuthMobileHeader showBack={step === "role"} />

          {step === "role" && (
            <div className="flex items-start justify-between gap-3 mb-6 lg:hidden">
              <div className="flex flex-col items-start gap-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <BrandLogo size="large" />
                  <span className="text-2xl font-bold text-foreground">SAJI</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("authPage.tagline")}</p>
              </div>
              <AuthHeroIllustration />
            </div>
          )}

          {step !== "success" && step !== "role" && (
            <div className="flex gap-2 mb-5">
              {STEP_ORDER.slice(1)
                .filter((s) => s !== "proSetup" || formData.role === "provider")
                // The shop-type step only exists for a POS account, so the
                // progress bar must not show an extra segment to everyone
                // else — it would make the form look longer than it is.
                .filter((s) => s !== "posShopType" || hasPos(formData.businessTypes))
                .map((s) => (
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

          {/* Step: proSetup — what this Saji Pro does, and whether it's a
              team. Both questions on one screen: they are short, related,
              and an extra step here is an extra chance to drop out. */}
          {step === "proSetup" && (
            <>
              <button onClick={() => setStep("role")} className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 active:scale-95 transition-transform">
                &larr; {t("authPage.back")}
              </button>
              <h2 className="text-2xl font-bold text-foreground mb-1">{t("authPage.signup.proSetupTitle")}</h2>
              <p className="text-sm text-muted-foreground mb-5">{t("authPage.signup.proSetupSubtitle")}</p>

              {/* Two columns from 380px up so all six fit without a long
                  scroll on a phone; one column below that so the labels
                  never wrap mid-word on the narrowest devices. */}
              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5">
                {PRO_BUSINESS_TYPES.map((type) => {
                  const meta = PRO_BUSINESS_TYPE_META[type]
                  const Icon = BUSINESS_TYPE_ICON[meta.icon] ?? Wrench
                  const selected = formData.businessTypes.includes(type)
                  // POS does not compose with anything but Sell Products, so
                  // some cards become unavailable the moment it is ticked —
                  // and POS itself becomes unavailable once something else
                  // is. Dimmed rather than hidden: a card that vanishes
                  // looks like a bug, and the reason is worth reading.
                  const { selectable, reason } = isTypeSelectable(type, formData.businessTypes)
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={selected}
                      aria-disabled={!selectable}
                      title={reason ?? undefined}
                      onClick={() => toggleBusinessType(type)}
                      className={`relative flex flex-col items-start gap-2 p-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                        selected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : !selectable
                            ? "border-dashed border-border bg-muted/40 opacity-55"
                            : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${BUSINESS_TYPE_ACCENT[meta.accent]}`}>
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground text-sm leading-tight">{meta.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{meta.description}</p>
                      </div>
                      <span
                        className={`absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                          selected
                            ? "bg-primary text-primary-foreground"
                            : !selectable
                              ? "bg-muted text-muted-foreground"
                              : "border border-border bg-background"
                        }`}
                      >
                        {selected
                          ? <Check className="w-3 h-3" strokeWidth={3} />
                          : !selectable
                            ? <LockIcon className="w-2.5 h-2.5" strokeWidth={2.5} />
                            : null}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-6">
                <p className="text-sm font-medium text-foreground mb-2.5">{t("authPage.signup.proSetupTeamHeading")}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {([
                    { value: "solo" as ProviderType, icon: HardHat, label: t("authPage.signup.proSetupSoloLabel"), desc: t("authPage.signup.proSetupSoloDesc") },
                    { value: "business" as ProviderType, icon: Users, label: t("authPage.signup.proSetupBusinessLabel"), desc: t("authPage.signup.proSetupBusinessDesc") },
                  ]).map((opt) => {
                    // Solo reads as chosen before anyone taps, because it is
                    // what Continue will use if they never do.
                    const selected = (formData.providerType ?? "solo") === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleSelectProviderType(opt.value)}
                        className={`flex flex-col items-start gap-1.5 p-3.5 rounded-2xl border text-left transition-all active:scale-[0.98] ${
                          selected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/50"
                        }`}
                      >
                        <opt.icon className={`w-4.5 h-4.5 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-semibold text-foreground text-sm leading-tight">{opt.label}</span>
                        <span className="text-[11px] text-muted-foreground leading-snug">{opt.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <Button onClick={handleProSetupContinue} className="w-full h-12 mt-6 rounded-xl font-semibold">
                {t("authPage.signup.proSetupContinue")}
                {formData.businessTypes.length > 0 && (
                  <span className="ml-1.5 opacity-80">
                    &middot; {t("authPage.signup.proSetupSelectedCount", { count: formData.businessTypes.length })}
                  </span>
                )}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </>
          )}

          {/* Step: which kind of shop (POS only) ----------------------------
              Thirty-five options, so this is a searchable grouped list of
              compact rows rather than a grid of cards: a card grid that size
              is a wall on a phone, and the thing the shopkeeper is doing is
              finding their own trade, not browsing. */}
          {step === "posShopType" && (
            <>
              <button
                onClick={() => { setStep("proSetup"); setError("") }}
                className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1 active:scale-95 transition-transform"
              >
                &larr; {t("authPage.back")}
              </button>
              <h2 className="text-2xl font-bold text-foreground mb-1">{t("authPage.signup.posShopTypeTitle")}</h2>
              <p className="text-sm text-muted-foreground mb-4">{t("authPage.signup.posShopTypeSubtitle")}</p>

              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={posSearch}
                  onChange={(e) => setPosSearch(e.target.value)}
                  placeholder={t("authPage.signup.posShopTypeSearch")}
                  className="h-11 pl-9 rounded-xl"
                  autoComplete="off"
                />
              </div>

              {/* Capped height with its own scroll so the Continue button
                  stays reachable without scrolling the whole page. */}
              <div className="max-h-[46vh] min-h-[220px] overflow-y-auto -mx-1 px-1 space-y-4">
                {(() => {
                  const q = posSearch.trim().toLowerCase()
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
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {t("authPage.signup.posShopTypeNoMatch")}
                      </p>
                    )
                  }

                  return groups.map((g) => (
                    <div key={g.group}>
                      <p className="sticky top-0 z-10 bg-card/95 backdrop-blur py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.label}
                      </p>
                      <div className="mt-1.5 space-y-1.5">
                        {g.profiles.map((pr) => {
                          const Icon = POS_PROFILE_ICON[pr.icon] ?? Store
                          const selected = formData.posProfileKey === pr.key
                          return (
                            <button
                              key={pr.key}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => selectPosProfile(pr.key)}
                              className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all active:scale-[0.99] ${
                                selected
                                  ? "border-primary bg-primary/5 shadow-sm"
                                  : "border-border bg-card hover:border-primary/50"
                              }`}
                            >
                              <span className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                selected
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              }`}>
                                <Icon className="w-4 h-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block font-semibold text-foreground text-sm leading-tight">{pr.label}</span>
                                <span className="block text-[11px] text-muted-foreground mt-0.5 leading-snug">{pr.description}</span>
                                {/* What picking this actually does. A preset
                                    the shopkeeper cannot see is a preset they
                                    cannot trust, and every one of these is
                                    changeable afterwards. */}
                                {selected && pr.traits.length > 0 && (
                                  <span className="mt-2 block text-[11px] leading-snug text-foreground/80">
                                    <span className="font-medium">{t("authPage.signup.posShopTypeIncluded")}</span>{" "}
                                    {pr.traits.map((tr) => POS_TRAIT_META[tr].label).join(" &middot; ")}
                                  </span>
                                )}
                              </span>
                              {selected && (
                                <Check className="w-4 h-4 text-primary flex-shrink-0 mt-1" strokeWidth={3} />
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()}
              </div>

              <Button onClick={handlePosShopTypeContinue} className="w-full h-12 mt-5 rounded-xl font-semibold">
                {t("authPage.signup.proSetupContinue")}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
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
                  <Button type="button" onClick={() => setStep(formData.role !== "provider" ? "role" : hasPos(formData.businessTypes) ? "posShopType" : "proSetup")} disabled={isLoading} variant="outline" className="h-10 rounded-xl bg-transparent gap-1 px-4">
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
                <Button type="button" onClick={handleGoogleSignup} disabled={isLoading} variant="outline" className="h-10 rounded-xl bg-card gap-2 text-xs sm:text-sm font-medium px-2">
                  <svg width="16" height="16" viewBox="0 0 48 48" className="flex-shrink-0"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.64-.15-3.21-.43-4.73H24v9.01h12.4c-.54 2.91-2.18 5.38-4.65 7.04l7.2 5.59c4.21-3.88 6.65-9.6 6.65-16.91z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.2-5.59c-2 1.35-4.56 2.15-8.7 2.15-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                  <span className="truncate">{t("authPage.continueWithGoogle")}</span>
                </Button>
                <Button type="button" onClick={handleAppleSignup} disabled={isLoading} className="h-10 rounded-xl gap-2 text-xs sm:text-sm font-medium bg-foreground text-background hover:bg-foreground/90 px-2">
                  <Apple className="w-4 h-4 flex-shrink-0" /> <span className="truncate">{t("authPage.continueWithApple")}</span>
                </Button>
              </div>

              {/* Security note */}
              <div className="mt-5 p-3 rounded-xl bg-primary/5 border border-primary/10 text-xs text-muted-foreground flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                {t("authPage.securityNote")}
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
              <h2 className="text-2xl font-bold text-foreground mb-1">
                {t((otpSentTo || primaryIdentifier).includes("@") ? "authPage.otp.verifyEmailTitle" : "authPage.otp.verifyPhoneTitle")}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                {t("authPage.otp.codeSentTo", { destination: otpSentTo || primaryIdentifier })}
              </p>
              {/* Said plainly, because the code arrived somewhere other than
                  where they asked for it and silence would just look broken. */}
              {otpFellBackToEmail && (
                <div className="mb-6 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-left">
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-snug">
                    We could not send a text message just now, so the code went to your email
                    instead. Nothing is wrong with your number &mdash; check your inbox, and the
                    spam folder if it is not there.
                  </p>
                </div>
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
