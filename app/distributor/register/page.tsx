"use client"

import React from "react"

import { useEffect, useState } from "react"
import {
  Building2, ChevronRight, ChevronLeft, Upload, MapPin,
  FileText, Camera, CheckCircle2, Clock, AlertCircle
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from "next/link"
import Image from "next/image"
import { completeDistributorOnboarding } from "@/lib/actions/distributor"
import { getActiveCounties } from "@/lib/actions/counties"
import { AddressAutocompleteInput, type PlaceResult } from "@/components/maps/address-autocomplete-input"
import { KycPhotoUpload } from "@/components/kyc/kyc-photo-upload"
import { SelfieCapture } from "@/components/kyc/selfie-capture"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function DistributorRegistrationPage() {
  const { t } = useLocalization()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    companyName: "",
    description: "",
    logo: null as string | null,
    county: "",
    town: "",
    streetAddress: "",
    buildingName: "",
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    idNumber: "",
    idFront: null as string | null,
    idBack: null as string | null,
    selfie: null as string | null,
    businessPermit: null as string | null,
    kraPIN: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [counties, setCounties] = useState<string[]>([])

  useEffect(() => {
    getActiveCounties().then((rows) => setCounties(rows.map((c) => c.name)))
  }, [])

  const handleImageUpload = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [field]: reader.result as string }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const result = await completeDistributorOnboarding(formData)
      if (!result.success) {
        setError(result.error)
        return
      }
      setSubmitted(true)
    } catch {
      setError(t("distributor.register.genericSubmitError"))
    } finally {
      setIsSubmitting(false)
    }
  }

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.companyName && formData.description
      case 2:
        return formData.county && formData.town && formData.streetAddress
      case 3:
        return formData.idNumber && formData.idFront && formData.idBack
      case 4:
        return !!formData.selfie
      default:
        return false
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center border-0 shadow-xl">
          <div className="w-20 h-20 bg-teal-100 dark:bg-teal-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{t("distributor.register.submittedTitle")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("distributor.register.submittedBody")}
          </p>
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4 mb-6 text-left">
            <h3 className="font-medium text-teal-900 dark:text-teal-200 mb-2">{t("distributor.register.whatsNext")}</h3>
            <ul className="space-y-2 text-sm text-teal-800 dark:text-teal-300">
              <li className="flex items-start gap-2">
                <span className="bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                {t("distributor.register.step1")}
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                {t("distributor.register.step2")}
              </li>
              <li className="flex items-start gap-2">
                <span className="bg-teal-200 dark:bg-teal-800 text-teal-800 dark:text-teal-200 rounded-full w-5 h-5 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                {t("distributor.register.step3")}
              </li>
            </ul>
          </div>
          <Link href="/">
            <Button className="w-full bg-teal-600 hover:bg-teal-700">
              {t("distributor.register.backToHome")}
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800">
      <div className="bg-gradient-to-r from-teal-700 to-cyan-700 text-white p-6">
        <div className="max-w-2xl mx-auto">
          <Link href="/" className="inline-flex items-center text-teal-100 hover:text-white mb-4 text-sm">
            <ChevronLeft className="w-4 h-4 mr-1" />
            {t("distributor.register.backToHome")}
          </Link>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("distributor.register.headerTitle")}</h1>
              <p className="text-teal-100 text-sm">{t("distributor.register.headerSubtitle")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-4">
        <Card className="p-4 mb-6 shadow-lg border-0">
          <div className="flex items-center justify-between">
            {[
              { num: 1, label: t("distributor.register.stepCompanyDetails") },
              { num: 2, label: t("distributor.register.stepLocation") },
              { num: 3, label: t("distributor.register.stepDocuments") },
              { num: 4, label: t("distributor.register.stepSelfie") }
            ].map((s, idx) => (
              <div key={s.num} className="flex items-center">
                <div className={`flex flex-col items-center ${idx > 0 ? 'ml-2' : ''}`}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${
                    step > s.num
                      ? 'bg-green-500 text-white'
                      : step === s.num
                        ? 'bg-teal-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                  }`}>
                    {step > s.num ? <CheckCircle2 className="w-5 h-5" /> : s.num}
                  </div>
                  <span className={`text-xs mt-1 hidden sm:block ${step >= s.num ? 'text-teal-600 font-medium' : 'text-muted-foreground'}`}>
                    {s.label}
                  </span>
                </div>
                {idx < 3 && (
                  <div className={`h-1 w-8 sm:w-16 mx-2 rounded-full ${step > s.num ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>
        </Card>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <Card className="p-6 shadow-lg border-0 mb-8">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t("distributor.register.stepCompanyDetails")}</h2>
                <p className="text-sm text-muted-foreground">{t("distributor.register.companyDetailsSubtitle")}</p>
              </div>

              <div>
                <Label>{t("distributor.register.companyNameLabel")}</Label>
                <Input
                  value={formData.companyName}
                  onChange={(e) => setFormData(prev => ({ ...prev, companyName: e.target.value }))}
                  placeholder={t("distributor.register.companyNamePlaceholder")}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>{t("distributor.register.companyDescriptionLabel")}</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t("distributor.register.companyDescriptionPlaceholder")}
                  className="mt-1.5 min-h-[100px]"
                />
              </div>

              <div>
                <Label>{t("distributor.register.companyLogoLabel")}</Label>
                <div className="mt-1.5">
                  {formData.logo ? (
                    <div className="relative w-32 h-32">
                      <Image
                        src={formData.logo || "/placeholder.svg"}
                        alt="Company logo"
                        fill
                        className="object-cover rounded-xl"
                      />
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, logo: null }))}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-muted-foreground/30 rounded-xl cursor-pointer hover:border-teal-500 transition-colors">
                      <Camera className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-xs text-muted-foreground">{t("distributor.register.uploadLogo")}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload('logo')} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t("distributor.register.locationTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("distributor.register.locationSubtitle")}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>{t("distributor.register.countyLabel")}</Label>
                  <Select value={formData.county} onValueChange={(v) => setFormData(prev => ({ ...prev, county: v }))}>
                    <SelectTrigger className="w-full mt-1.5"><SelectValue placeholder={t("distributor.register.selectCounty")} /></SelectTrigger>
                    <SelectContent>
                      {counties.map(county => (
                        <SelectItem key={county} value={county}>{county}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("distributor.register.townLabel")}</Label>
                  <Input
                    value={formData.town}
                    onChange={(e) => setFormData(prev => ({ ...prev, town: e.target.value }))}
                    placeholder={t("distributor.register.townPlaceholder")}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div>
                <Label>{t("distributor.register.streetAddressLabel")}</Label>
                <AddressAutocompleteInput
                  value={formData.streetAddress}
                  onChange={(streetAddress) => setFormData(prev => ({ ...prev, streetAddress, latitude: undefined, longitude: undefined }))}
                  onPlaceSelected={(place: PlaceResult) => setFormData(prev => ({ ...prev, streetAddress: place.address, latitude: place.latitude, longitude: place.longitude }))}
                  placeholder={t("distributor.register.streetAddressPlaceholder")}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>{t("distributor.register.buildingNameLabel")}</Label>
                <Input
                  value={formData.buildingName}
                  onChange={(e) => setFormData(prev => ({ ...prev, buildingName: e.target.value }))}
                  placeholder={t("distributor.register.buildingNamePlaceholder")}
                  className="mt-1.5"
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-900 dark:text-blue-200 text-sm">{t("distributor.register.locationVerificationTitle")}</p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    {t("distributor.register.locationVerificationBody")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t("distributor.register.documentsTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("distributor.register.documentsSubtitle")}</p>
              </div>

              <div>
                <Label>{t("distributor.register.idNumberLabel")}</Label>
                <Input
                  value={formData.idNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, idNumber: e.target.value }))}
                  placeholder={t("distributor.register.idNumberPlaceholder")}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>{t("distributor.register.idPhotosLabel")}</Label>
                <p className="text-xs text-muted-foreground mb-2">{t("distributor.register.idPhotosHint")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <KycPhotoUpload label={t("distributor.register.idFrontLabel")} value={formData.idFront ?? ""} onChange={(v) => setFormData(prev => ({ ...prev, idFront: v || null }))} />
                  <KycPhotoUpload label={t("distributor.register.idBackLabel")} value={formData.idBack ?? ""} onChange={(v) => setFormData(prev => ({ ...prev, idBack: v || null }))} />
                </div>
              </div>

              <div>
                <Label>{t("distributor.register.kraPinLabel")}</Label>
                <Input
                  value={formData.kraPIN}
                  onChange={(e) => setFormData(prev => ({ ...prev, kraPIN: e.target.value }))}
                  placeholder={t("distributor.register.kraPinPlaceholder")}
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>{t("distributor.register.businessPermitLabel")}</Label>
                <div className="mt-1.5">
                  {formData.businessPermit ? (
                    <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <FileText className="w-8 h-8 text-green-600" />
                      <div className="flex-1">
                        <p className="font-medium text-green-900 dark:text-green-200 text-sm">{t("distributor.register.documentUploaded")}</p>
                        <p className="text-xs text-green-700 dark:text-green-300">{t("distributor.register.clickToReplace")}</p>
                      </div>
                      <button
                        onClick={() => setFormData(prev => ({ ...prev, businessPermit: null }))}
                        className="text-red-500 hover:text-red-700"
                      >
                        {t("distributor.register.removeButton")}
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-3 p-4 border-2 border-dashed border-muted-foreground/30 rounded-lg cursor-pointer hover:border-teal-500 transition-colors">
                      <Upload className="w-6 h-6 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{t("distributor.register.uploadPermitPrompt")}</span>
                      <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleImageUpload('businessPermit')} />
                    </label>
                  )}
                </div>
              </div>

              <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-teal-600 mt-0.5" />
                <div>
                  <p className="font-medium text-teal-900 dark:text-teal-200 text-sm">{t("distributor.register.importantTitle")}</p>
                  <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">
                    {t("distributor.register.documentsImportantBody")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{t("distributor.register.selfieTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("distributor.register.selfieSubtitle")}</p>
              </div>

              <SelfieCapture value={formData.selfie ?? ""} onChange={(v) => setFormData(prev => ({ ...prev, selfie: v || null }))} />

              <div className="bg-teal-50 dark:bg-teal-900/20 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-teal-600 mt-0.5" />
                <div>
                  <p className="font-medium text-teal-900 dark:text-teal-200 text-sm">{t("distributor.register.importantTitle")}</p>
                  <p className="text-xs text-teal-700 dark:text-teal-300 mt-1">
                    {t("distributor.register.selfieImportantBody")}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-8">
            {step > 1 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                className="flex-1 bg-transparent"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                {t("distributor.register.backButton")}
              </Button>
            )}
            {step < 4 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={!isStepValid()}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                {t("distributor.register.nextButton")}
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!isStepValid() || isSubmitting}
                className="flex-1 bg-teal-600 hover:bg-teal-700"
              >
                {isSubmitting ? t("distributor.register.submittingButton") : t("distributor.register.submitButton")}
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-6 mb-8 border-0 shadow-sm bg-gradient-to-br from-teal-700 to-cyan-700 text-white">
          <h3 className="font-bold text-lg mb-4">{t("distributor.register.whyDistributeTitle")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-teal-200 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{t("distributor.register.benefit1Title")}</p>
                <p className="text-xs text-teal-100">{t("distributor.register.benefit1Desc")}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-teal-200 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{t("distributor.register.benefit2Title")}</p>
                <p className="text-xs text-teal-100">{t("distributor.register.benefit2Desc")}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-teal-200 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{t("distributor.register.benefit3Title")}</p>
                <p className="text-xs text-teal-100">{t("distributor.register.benefit3Desc")}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-teal-200 mt-0.5" />
              <div>
                <p className="font-medium text-sm">{t("distributor.register.benefit4Title")}</p>
                <p className="text-xs text-teal-100">{t("distributor.register.benefit4Desc")}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
