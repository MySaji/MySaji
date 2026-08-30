"use client"

import { useEffect, useState } from "react"
import { Award, CheckCircle2, XCircle, Loader2, FileText } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getPendingCertifications, reviewCertification, type PendingCertification } from "@/lib/actions/admin-certifications"

export default function AdminCertificationsPage() {
  const [items, setItems] = useState<PendingCertification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = () => getPendingCertifications().then(setItems)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleReview = async (id: string, approve: boolean) => {
    setBusyId(id)
    const result = await reviewCertification({ id, approve })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900 dark:text-white"><Award className="h-8 w-8 text-blue-600" /> Certifications</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">Review provider-submitted licenses and certifications. Approving one lets a provider accept jobs in categories that require it.</p>
      </div>

      {items.length === 0 ? (
        <Card className="border-0 p-10 text-center shadow-lg">
          <p className="text-xs text-gray-600 dark:text-gray-400">No certifications waiting for review.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <Card key={c.id} className="border-0 p-5 shadow-lg">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{c.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{c.providerName}{c.categoryName ? ` · ${c.categoryName}` : ""}</p>
                  <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-500">Issued by {c.issuer} on {new Date(c.dateIssued).toLocaleDateString()}{c.expiryDate ? ` · expires ${new Date(c.expiryDate).toLocaleDateString()}` : ""}</p>
                  {c.documentUrl && (
                    <a href={c.documentUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline">
                      <FileText className="h-3.5 w-3.5" /> View document
                    </a>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5 bg-transparent" disabled={busyId === c.id} onClick={() => handleReview(c.id, false)}>
                    <XCircle className="h-4 w-4" />Reject
                  </Button>
                  <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" disabled={busyId === c.id} onClick={() => handleReview(c.id, true)}>
                    {busyId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" />Approve</>}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
