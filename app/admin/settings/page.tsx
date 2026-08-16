"use client"
import { useEffect, useRef, useState } from "react"
import { Save, CheckCircle2, Loader2, Upload, X, ImageIcon, AlertTriangle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getPlatformPreferences, updatePlatformPreferences, type PlatformPreferences,
  getBrandingSettings, updateBrandingSettings, type BrandingSettings,
  getContactSettings, updateContactSettings, type ContactSettings,
  getLegalContent, updateLegalContent, type LegalContent,
} from "@/lib/actions/admin-settings"
import { getExchangeRatesForAdmin, updateExchangeRates } from "@/lib/actions/exchange-rates"
import type { ExchangeRateRow } from "@/lib/currency"

const MAX_LOGO_BYTES = 1_500_000

function SavedBadge({ show }: { show: boolean }) {
  const { t } = useLocalization()
  if (!show) return null
  return (
    <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm">
      <CheckCircle2 size={16} />
      {t("admin.settings.saved")}
    </div>
  )
}

function PlatformTab() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [preferences, setPreferences] = useState<PlatformPreferences | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getPlatformPreferences().then(setPreferences).finally(() => setIsLoading(false))
  }, [])

  const handleSave = async () => {
    if (!preferences) return
    setIsSaving(true)
    const result = await updatePlatformPreferences(preferences)
    setIsSaving(false)
    if (!result.success) { alert(result.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (isLoading || !preferences) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  const toggles = [
    { id: "autoApprove" as const, label: t("admin.settings.autoApproveListings"), desc: t("admin.settings.autoApproveListingsDesc") },
    { id: "requireVerification" as const, label: t("admin.settings.requireProviderVerification"), desc: t("admin.settings.requireProviderVerificationDesc") },
    { id: "enableDisputeResolution" as const, label: t("admin.settings.enableDisputeResolution"), desc: t("admin.settings.enableDisputeResolutionDesc") },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-0 shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t("admin.settings.defaultPlatformFee")}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("admin.settings.platformFeeDesc")}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-primary">{preferences.platformFee}%</div>
          </div>
        </div>
        <input
          type="range"
          min="1"
          max="20"
          value={preferences.platformFee}
          onChange={(e) => setPreferences({ ...preferences, platformFee: parseInt(e.target.value) })}
          className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>1%</span>
          <span>20%</span>
        </div>
      </Card>

      <Card className="border-0 shadow-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t("admin.settings.cancellationDispatchFee")}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("admin.settings.cancellationDispatchFeeDesc")}</p>
        </div>
        <div className="flex items-center gap-2 max-w-xs">
          <span className="text-sm text-gray-500 dark:text-gray-400">KES</span>
          <Input
            type="number"
            min="0"
            max="10000"
            value={preferences.cancellationDispatchFee}
            onChange={(e) => setPreferences({ ...preferences, cancellationDispatchFee: Number(e.target.value) || 0 })}
          />
        </div>
      </Card>

      <Card className="border-0 shadow-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t("admin.settings.protectionCoverageLimit")}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("admin.settings.protectionCoverageLimitDesc")}</p>
        </div>
        <div className="flex items-center gap-2 max-w-xs">
          <span className="text-sm text-gray-500 dark:text-gray-400">KES</span>
          <Input
            type="number"
            min="0"
            max="10000000"
            value={preferences.protectionCoverageLimit}
            onChange={(e) => setPreferences({ ...preferences, protectionCoverageLimit: Number(e.target.value) || 0 })}
          />
        </div>
      </Card>

      <Card className="border-0 shadow-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t("admin.settings.providerProPrice")}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("admin.settings.providerProPriceDesc")}</p>
        </div>
        <div className="flex items-center gap-2 max-w-xs">
          <span className="text-sm text-gray-500 dark:text-gray-400">KES</span>
          <Input
            type="number"
            min="0"
            max="1000000"
            value={preferences.providerProPriceKES}
            onChange={(e) => setPreferences({ ...preferences, providerProPriceKES: Number(e.target.value) || 0 })}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">{t("admin.settings.perMonth")}</span>
        </div>
      </Card>

      <Card className="border-0 shadow-lg p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t("admin.settings.offerFreeTierCap")}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("admin.settings.offerFreeTierCapDesc")}</p>
        </div>
        <div className="flex items-center gap-2 max-w-xs">
          <Input
            type="number"
            min="0"
            max="1000"
            value={preferences.offerFreeTierCap}
            onChange={(e) => setPreferences({ ...preferences, offerFreeTierCap: Number(e.target.value) || 0 })}
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">{t("admin.settings.offersUnit")}</span>
        </div>
      </Card>

      <Card className={`border-0 shadow-lg p-6 flex items-center justify-between gap-4 ${preferences.maintenanceMode ? "ring-2 ring-red-500/50 bg-red-50 dark:bg-red-900/20" : ""}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{t("admin.settings.maintenanceMode")}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("admin.settings.maintenanceModeDesc")}</p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={preferences.maintenanceMode}
            onChange={(e) => setPreferences({ ...preferences, maintenanceMode: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-12 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-500/30 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-red-600" />
        </label>
      </Card>

      <div className="space-y-4">
        {toggles.map((item) => (
          <Card key={item.id} className="border-0 shadow-lg p-6 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{item.label}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{item.desc}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences[item.id]}
                onChange={(e) => setPreferences({ ...preferences, [item.id]: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-12 h-7 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/30 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-primary" />
            </label>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {t("admin.settings.savePreferences")}
        </Button>
        <SavedBadge show={saved} />
      </div>
    </div>
  )
}

function BrandingTab() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [branding, setBranding] = useState<BrandingSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getBrandingSettings().then(setBranding).finally(() => setIsLoading(false))
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError("")
    if (file.size > MAX_LOGO_BYTES) {
      setError(t("admin.settings.logoTooLarge"))
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => setBranding({ logoUrl: reader.result as string })
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!branding) return
    setIsSaving(true)
    setError("")
    const result = await updateBrandingSettings(branding)
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (isLoading || !branding) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-0 shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t("admin.settings.appLogo")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t("admin.settings.appLogoDesc")}
        </p>

        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/40 flex-shrink-0">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo preview" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-8 h-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <Button type="button" variant="outline" className="gap-2 bg-transparent" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4" /> {branding.logoUrl ? t("admin.settings.replaceLogo") : t("admin.settings.uploadLogo")}
            </Button>
            {branding.logoUrl && (
              <Button type="button" variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive w-fit" onClick={() => setBranding({ logoUrl: null })}>
                <X className="w-4 h-4" /> {t("admin.settings.removeLogo")}
              </Button>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {t("admin.settings.saveBranding")}
        </Button>
        <SavedBadge show={saved} />
      </div>
    </div>
  )
}

function ContactTab() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [contact, setContact] = useState<ContactSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getContactSettings().then(setContact).finally(() => setIsLoading(false))
  }, [])

  const handleSave = async () => {
    if (!contact) return
    setIsSaving(true)
    setError("")
    const result = await updateContactSettings(contact)
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (isLoading || !contact) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  const socialFields = [
    { id: "facebookUrl" as const, label: t("admin.settings.facebook") },
    { id: "twitterUrl" as const, label: t("admin.settings.twitter") },
    { id: "instagramUrl" as const, label: t("admin.settings.instagram") },
    { id: "linkedinUrl" as const, label: t("admin.settings.linkedin") },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-0 shadow-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t("admin.settings.supportContact")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2">{t("admin.settings.supportContactDesc")}</p>
        <div className="space-y-2">
          <Label htmlFor="supportEmail">{t("admin.settings.supportEmail")}</Label>
          <Input id="supportEmail" type="email" value={contact.supportEmail} onChange={(e) => setContact({ ...contact, supportEmail: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="supportPhone">{t("admin.settings.supportPhone")}</Label>
          <Input id="supportPhone" value={contact.supportPhone} onChange={(e) => setContact({ ...contact, supportPhone: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="address">{t("admin.settings.address")}</Label>
          <Input id="address" value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
        </div>
      </Card>

      <Card className="border-0 shadow-lg p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t("admin.settings.socialMediaLinks")}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 -mt-2">{t("admin.settings.socialMediaLinksDesc")}</p>
        {socialFields.map((f) => (
          <div key={f.id} className="space-y-2">
            <Label htmlFor={f.id}>{f.label}</Label>
            <Input id={f.id} placeholder="https://..." value={contact[f.id]} onChange={(e) => setContact({ ...contact, [f.id]: e.target.value })} />
          </div>
        ))}
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {t("admin.settings.saveContactInfo")}
        </Button>
        <SavedBadge show={saved} />
      </div>
    </div>
  )
}

function LegalTab() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [legal, setLegal] = useState<LegalContent | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getLegalContent().then(setLegal).finally(() => setIsLoading(false))
  }, [])

  const handleSave = async () => {
    if (!legal) return
    setIsSaving(true)
    setError("")
    const result = await updateLegalContent(legal)
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (isLoading || !legal) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-lg bg-muted/60 border border-border px-4 py-3 text-sm text-muted-foreground">
        {t("admin.settings.legalHintPrefix")} <code className="text-foreground font-mono">## </code> {t("admin.settings.legalHintMiddle")} <code className="text-foreground font-mono">- </code> {t("admin.settings.legalHintSuffix")}
      </div>

      <Card className="border-0 shadow-lg p-6 space-y-3">
        <Label htmlFor="terms">{t("admin.settings.termsOfService")}</Label>
        <Textarea
          id="terms"
          rows={10}
          placeholder={t("admin.settings.termsPlaceholder")}
          value={legal.termsContent}
          onChange={(e) => setLegal({ ...legal, termsContent: e.target.value })}
          className="font-mono text-sm"
        />
      </Card>

      <Card className="border-0 shadow-lg p-6 space-y-3">
        <Label htmlFor="privacy">{t("admin.settings.privacyPolicy")}</Label>
        <Textarea
          id="privacy"
          rows={10}
          placeholder={t("admin.settings.privacyPlaceholder")}
          value={legal.privacyContent}
          onChange={(e) => setLegal({ ...legal, privacyContent: e.target.value })}
          className="font-mono text-sm"
        />
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {t("admin.settings.saveLegalPages")}
        </Button>
        <SavedBadge show={saved} />
      </div>
    </div>
  )
}

function CurrencyTab() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [rates, setRates] = useState<ExchangeRateRow[] | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getExchangeRatesForAdmin().then(setRates).finally(() => setIsLoading(false))
  }, [])

  const handleRateChange = (code: string, value: string) => {
    if (!rates) return
    const parsed = Number(value)
    setRates(rates.map((r) => (r.code === code ? { ...r, rate: Number.isFinite(parsed) ? parsed : r.rate } : r)))
  }

  const handleSave = async () => {
    if (!rates) return
    setIsSaving(true)
    setError("")
    const result = await updateExchangeRates(rates)
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (isLoading || !rates) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="border-0 shadow-lg p-6 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t("admin.settings.exchangeRates")}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {t("admin.settings.exchangeRatesDesc")}
          </p>
        </div>
        {rates.map((r) => (
          <div key={r.code} className="flex items-center gap-4">
            <div className="w-32 flex-shrink-0">
              <p className="font-medium text-gray-900 dark:text-white">{r.code}</p>
              <p className="text-xs text-gray-500">{r.name}</p>
            </div>
            <Input
              type="number"
              step="0.0001"
              value={r.rate}
              disabled={r.isBase}
              onChange={(e) => handleRateChange(r.code, e.target.value)}
              className="max-w-[160px]"
            />
            {r.isBase && <span className="text-xs text-gray-500">{t("admin.settings.baseCurrencyFixed")}</span>}
          </div>
        ))}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving} className="gap-2">
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {t("admin.settings.saveRates")}
        </Button>
        <SavedBadge show={saved} />
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useLocalization()
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("admin.settings.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">{t("admin.settings.subtitle")}</p>
      </div>

      <Tabs defaultValue="platform" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-5">
          <TabsTrigger value="platform">{t("admin.settings.tabPlatform")}</TabsTrigger>
          <TabsTrigger value="branding">{t("admin.settings.tabBranding")}</TabsTrigger>
          <TabsTrigger value="contact">{t("admin.settings.tabContact")}</TabsTrigger>
          <TabsTrigger value="legal">{t("admin.settings.tabLegal")}</TabsTrigger>
          <TabsTrigger value="currency">{t("admin.settings.tabCurrency")}</TabsTrigger>
        </TabsList>

        <TabsContent value="platform" className="mt-6">
          <PlatformTab />
        </TabsContent>
        <TabsContent value="branding" className="mt-6">
          <BrandingTab />
        </TabsContent>
        <TabsContent value="contact" className="mt-6">
          <ContactTab />
        </TabsContent>
        <TabsContent value="legal" className="mt-6">
          <LegalTab />
        </TabsContent>
        <TabsContent value="currency" className="mt-6">
          <CurrencyTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
