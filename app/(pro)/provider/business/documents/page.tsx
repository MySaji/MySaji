"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, FileText, Award, Building2 } from "lucide-react"
import { getBusinessDocuments, type BusinessDocumentsResult } from "@/backend/actions/provider-business"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

const KYC_STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  PENDING: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
  REJECTED: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
}

const DOC_TYPE_LABEL: Record<string, string> = {
  NATIONAL_ID: "National ID",
  PASSPORT: "Passport",
  DRIVERS_LICENSE: "Driver's License",
  BUSINESS_PERMIT: "Business Permit",
}

export default function BusinessDocumentsPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<BusinessDocumentsResult>({ isBusinessOwner: false })

  useEffect(() => {
    getBusinessDocuments().then(setData).finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!data.isBusinessOwner) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
          {t("provider.business.staff.notBusinessAccount")}
        </div>
      </div>
    )
  }

  return (
    <div className="pb-8 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/provider/business/dashboard" className="lg:hidden">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("provider.business.documents.title")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.business.documents.subtitle")}</p>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-3">
          <Building2 className="w-4 h-4" /> {t("provider.business.documents.registrationTitle")}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("provider.business.documents.registrationNumber")}</p>
            <p className="font-medium text-gray-900 dark:text-white">{data.registrationNumber || t("provider.business.documents.notProvided")}</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{t("provider.business.documents.hqAddress")}</p>
            <p className="font-medium text-gray-900 dark:text-white">{data.hqAddress || t("provider.business.documents.notProvided")}</p>
          </div>
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-3">
          <FileText className="w-4 h-4" /> {t("provider.business.documents.kycTitle")}
        </h2>
        {data.kycDocuments.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.business.documents.noKyc")}</p>
        ) : (
          <div className="space-y-2">
            {data.kycDocuments.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-xs truncate">{doc.memberName}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {DOC_TYPE_LABEL[doc.documentType] ?? doc.documentType} · {new Date(doc.submittedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full ${KYC_STATUS_STYLE[doc.status] ?? ""}`}>{doc.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-3">
          <Award className="w-4 h-4" /> {t("provider.business.documents.certificationsTitle")}
        </h2>
        {data.certifications.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.business.documents.noCertifications")}</p>
        ) : (
          <div className="space-y-2">
            {data.certifications.map((cert) => (
              <div key={cert.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-xs truncate">{cert.name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                    {cert.memberName} · {cert.issuer}
                    {cert.expiryDate && ` · ${t("provider.business.documents.expires")} ${new Date(cert.expiryDate).toLocaleDateString()}`}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full ${KYC_STATUS_STYLE[cert.status] ?? ""}`}>{cert.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
