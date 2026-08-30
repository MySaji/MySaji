"use client"

import { useEffect, useState } from "react"
import { Award, Upload, Check, Clock, X, Plus, Shield, Star, AlertCircle, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { getMyCertifications, addMyCertification, removeMyCertification, type ProviderCertification } from "@/lib/actions/provider-credentials"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { TranslationKey } from "@/lib/i18n"

const statusConfig: Record<string, { color: string; labelKey: TranslationKey; icon: typeof Check }> = {
  approved: { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", labelKey: "provider.certifications.statusVerified", icon: Check },
  pending: { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", labelKey: "provider.certifications.statusUnderReview", icon: Clock },
  rejected: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", labelKey: "provider.certifications.statusRejected", icon: AlertCircle },
  expired: { color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", labelKey: "provider.certifications.statusExpired", icon: AlertCircle },
}

export default function CertificationsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [certifications, setCertifications] = useState<ProviderCertification[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newCert, setNewCert] = useState({ name: "", issuer: "", dateIssued: "", expiryDate: "", documentUrl: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = () => getMyCertifications().then(setCertifications)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setNewCert((p) => ({ ...p, documentUrl: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const addCert = async () => {
    setIsSaving(true)
    setFormError("")
    const result = await addMyCertification(newCert)
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowAdd(false)
    setNewCert({ name: "", issuer: "", dateIssued: "", expiryDate: "", documentUrl: "" })
    await refresh()
  }

  const removeCert = async (id: string) => {
    setCertifications((prev) => prev.filter((c) => c.id !== id))
    await removeMyCertification({ id })
  }

  const verifiedCount = certifications.filter((c) => c.status === "approved").length

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("provider.certifications.title")}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t("provider.certifications.subtitle")}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="rounded-xl"><Plus className="w-4 h-4 mr-2" />{t("provider.certifications.addCertification")}</Button>
      </div>

      {/* Trust Score */}
      <Card className="p-4 border border-border rounded-xl">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">{t("provider.certifications.trustScoreTitle")}</h3>
            <p className="text-[11px] text-muted-foreground mb-2">{t("provider.certifications.verifiedOfTotal", { verified: verifiedCount, total: certifications.length })}</p>
            <div className="h-2.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(verifiedCount / Math.max(certifications.length, 1)) * 100}%` }} />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-primary">{Math.round((verifiedCount / Math.max(certifications.length, 1)) * 100)}%</p>
          </div>
        </div>
      </Card>

      {/* Badges earned */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">{t("provider.certifications.earnedBadgesTitle")}</h3>
        <div className="flex flex-wrap gap-2">
          {verifiedCount >= 1 && (
            <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-[11px] font-medium"><Award className="w-3.5 h-3.5" />{t("provider.certifications.badgeCertifiedPro")}</div>
          )}
          {verifiedCount >= 2 && (
            <div className="flex items-center gap-1.5 bg-accent/10 text-accent px-3 py-1.5 rounded-full text-[11px] font-medium"><Star className="w-3.5 h-3.5" />{t("provider.certifications.badgeMultiSkilled")}</div>
          )}
          {verifiedCount >= 3 && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 text-amber-600 px-3 py-1.5 rounded-full text-[11px] font-medium"><Shield className="w-3.5 h-3.5" />{t("provider.certifications.badgeTrustedExpert")}</div>
          )}
          {verifiedCount < 1 && <p className="text-[11px] text-muted-foreground">{t("provider.certifications.noBadgesYetText")}</p>}
        </div>
      </div>

      {/* Certifications List */}
      <div className="space-y-2">
        {certifications.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-xs text-muted-foreground">{t("provider.certifications.emptyText")}</p>
          </Card>
        )}
        {certifications.map((cert) => {
          const config = statusConfig[cert.status]
          const StatusIcon = config.icon
          return (
            <Card key={cert.id} className="p-4 border border-border rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Award className="w-5 h-5 text-primary" /></div>
                  <div>
                    <h4 className="font-semibold text-foreground text-xs">{cert.name}</h4>
                    <p className="text-[11px] text-muted-foreground">{cert.issuer}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                      <span>{t("provider.certifications.issuedLabel", { date: new Date(cert.dateIssued).toLocaleDateString() })}</span>
                      {cert.expiryDate && <span>{t("provider.certifications.expiresLabel", { date: new Date(cert.expiryDate).toLocaleDateString() })}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${config.color}`}>
                    <StatusIcon className="w-3 h-3" />{t(config.labelKey)}
                  </span>
                  <button onClick={() => removeCert(cert.id)} aria-label={t("common.delete")} className="p-1 rounded hover:bg-destructive/10 transition-colors"><X className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md rounded-xl" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground">{t("provider.certifications.addCertification")}</h2>
            <Input value={newCert.name} onChange={(e) => setNewCert((p) => ({ ...p, name: e.target.value }))} placeholder={t("provider.certifications.namePlaceholder")} className="rounded-lg bg-card border-border" />
            <Input value={newCert.issuer} onChange={(e) => setNewCert((p) => ({ ...p, issuer: e.target.value }))} placeholder={t("provider.certifications.issuerPlaceholder")} className="rounded-lg bg-card border-border" />
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[11px] text-muted-foreground mb-1 block">{t("provider.certifications.dateIssuedLabel")}</label><Input type="date" value={newCert.dateIssued} onChange={(e) => setNewCert((p) => ({ ...p, dateIssued: e.target.value }))} className="rounded-lg bg-card border-border" /></div>
              <div><label className="text-[11px] text-muted-foreground mb-1 block">{t("provider.certifications.expiryDateLabel")}</label><Input type="date" value={newCert.expiryDate} onChange={(e) => setNewCert((p) => ({ ...p, expiryDate: e.target.value }))} className="rounded-lg bg-card border-border" /></div>
            </div>
            <label className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 transition-colors block">
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleDocumentChange} />
              <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-[11px] text-muted-foreground">{newCert.documentUrl ? t("provider.certifications.documentAttached") : t("provider.certifications.uploadDocumentPrompt")}</p>
            </label>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAdd(false)} className="flex-1 rounded-xl" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={addCert} disabled={!newCert.name.trim() || !newCert.issuer.trim() || !newCert.dateIssued || isSaving} className="flex-1 rounded-xl">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.certifications.submitForReview")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
