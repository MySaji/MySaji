"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createServiceRequest } from "@/lib/actions/service-contracts"
import { useGatedAction } from "@/lib/hooks/useGatedAction"

export default function NewServiceRequestPage() {
  const { handleGateFailure } = useGatedAction()
  const router = useRouter()
  const searchParams = useSearchParams()
  const providerId = searchParams.get("provider") ?? ""

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [location, setLocation] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async () => {
    if (!providerId) { setError("Missing provider. Go back and pick a provider first."); return }
    setIsSubmitting(true)
    setError("")
    const result = await createServiceRequest({ providerId, title, description, location })
    setIsSubmitting(false)
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the user
      // with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setError(result.error)
      return
    }
    router.push(`/customer/service-requests?id=${result.contractId}`)
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="sticky top-0 z-30 bg-gradient-to-r from-primary to-primary/90 px-4 py-4 text-primary-foreground">
        <div className="mx-auto flex max-w-xl items-center gap-4">
          <button onClick={() => router.back()} className="rounded-lg p-2 hover:bg-white/20"><ArrowLeft className="h-6 w-6" /></button>
          <div className="flex items-center gap-2"><FileText className="h-5 w-5" /><h1 className="text-base font-bold">Request a Quote</h1></div>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <Card className="border-0 p-5 shadow-sm space-y-4">
          <p className="text-xs text-muted-foreground">
            Describe what you need. The provider will review it and send back a real quote with price, scope of work, and an estimated timeline for you to accept or decline.
          </p>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">What do you need?</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kitchen sink replacement" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Details</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the job: what's needed, any constraints, preferred timing…" className="min-h-[120px]" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Location</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where should this happen?" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button className="h-11 w-full rounded-xl" disabled={isSubmitting || !title.trim() || !description.trim() || !location.trim()} onClick={handleSubmit}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Request"}
          </Button>
        </Card>
      </div>
    </div>
  )
}
