"use client"

import { useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { FileText, Download, Loader2 } from "lucide-react"
import {
  getUserActivityReport, getVerificationSummaryReport, getDisputeResolutionReport,
} from "@/backend/actions/sub-admin-reports"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const reportIds = ["users", "verifications", "disputes"] as const

type ReportId = (typeof reportIds)[number]

export default function SubAdminReportsPage() {
  const { t } = useLocalization()
  const [generatingId, setGeneratingId] = useState<ReportId | null>(null)

  const reportDefs = [
    { id: "users" as const, title: t("subAdmin.reports.userActivityTitle"), desc: t("subAdmin.reports.userActivityDesc") },
    { id: "verifications" as const, title: t("subAdmin.reports.verificationSummaryTitle"), desc: t("subAdmin.reports.verificationSummaryDesc") },
    { id: "disputes" as const, title: t("subAdmin.reports.disputeResolutionTitle"), desc: t("subAdmin.reports.disputeResolutionDesc") },
  ]

  const handleGenerate = async (id: ReportId) => {
    setGeneratingId(id)
    const dateStr = new Date().toISOString().split("T")[0]
    try {
      if (id === "users") {
        const rows = await getUserActivityReport()
        downloadCsv(`user-activity-${dateStr}.csv`, [
          [t("subAdmin.reports.csvName"), t("auth.email"), t("subAdmin.users.colRole"), t("common.status"), t("subAdmin.reports.csvJoined"), t("subAdmin.reports.csvOrdersJobs")],
          ...rows.map((r) => [r.name, r.email, r.role, r.status, r.joined, r.ordersOrJobs]),
        ])
      } else if (id === "verifications") {
        const rows = await getVerificationSummaryReport()
        downloadCsv(`verification-summary-${dateStr}.csv`, [
          [t("subAdmin.reports.csvName"), t("subAdmin.users.colRole"), t("subAdmin.reports.csvDocumentType"), t("common.status"), t("subAdmin.reports.csvSubmitted"), t("subAdmin.reports.csvReviewed")],
          ...rows.map((r) => [r.name, r.role, r.documentType, r.status, r.submitted, r.reviewed]),
        ])
      } else {
        const rows = await getDisputeResolutionReport()
        downloadCsv(`dispute-resolution-${dateStr}.csv`, [
          [t("subAdmin.reports.csvDisputeNumber"), t("common.status"), t("subAdmin.reports.csvSeverity"), t("subAdmin.reports.csvAssignedAgent"), t("subAdmin.reports.csvCreated"), t("subAdmin.reports.csvResolved")],
          ...rows.map((r) => [r.disputeNumber, r.status, r.severity, r.assignedAgent, r.created, r.resolved]),
        ])
      }
    } finally {
      setGeneratingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("subAdmin.reports.title")}</h1>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t("subAdmin.reports.subtitle")}</p>
      </div>

      <div className="space-y-3">
        {reportDefs.map((r) => (
          <Card key={r.id} className="p-4 border-0 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{r.title}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{r.desc}</p>
                </div>
              </div>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 gap-1 text-[11px] h-8"
                onClick={() => handleGenerate(r.id)}
                disabled={generatingId === r.id}
              >
                {generatingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {generatingId === r.id ? t("subAdmin.reports.generatingButton") : t("subAdmin.reports.generateDownloadButton")}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
