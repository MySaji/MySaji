"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Users, Loader2, Building2, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMyProviderBusinessInfo, completeBusinessOnboarding, type ProviderBusinessInfo } from "@/lib/actions/provider-business"

/** The "Team" nav entry Saji Pro solo providers get (see provider-sidebar.tsx —
 * hidden for free-tier solo, always available to Business owners via the
 * existing Team Directory). A solo provider has no team to manage yet, so
 * this is a real, single-step gateway into the exact same "Convert to
 * Business" upgrade already offered from My Account
 * (completeBusinessOnboarding) — no separate/lighter team system invented,
 * just a more discoverable entry point into the one that already exists.
 * A provider who's already a Business owner is sent straight through to
 * the real Team Directory instead of seeing this prompt again. */
export default function TeamEntryPage() {
  const router = useRouter()
  const [info, setInfo] = useState<ProviderBusinessInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [registrationNumber, setRegistrationNumber] = useState("")
  const [hqAddress, setHqAddress] = useState("")
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [error, setError] = useState("")
  const [upgraded, setUpgraded] = useState(false)

  useEffect(() => {
    getMyProviderBusinessInfo().then((data) => {
      setInfo(data)
      setIsLoading(false)
      if (data?.isBusinessOwner) router.replace("/provider/business/staff")
    })
  }, [router])

  const handleUpgrade = async () => {
    if (!registrationNumber.trim() || !hqAddress.trim()) return
    setIsUpgrading(true)
    setError("")
    const result = await completeBusinessOnboarding({ registrationNumber, hqAddress })
    setIsUpgrading(false)
    if (!result.success) { setError(result.error); return }
    setUpgraded(true)
    setTimeout(() => router.push("/provider/business/staff"), 1200)
  }

  if (isLoading || info?.isBusinessOwner) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (info?.parentBusinessId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-semibold text-foreground">You're already part of a team</p>
        <p className="text-sm text-muted-foreground">You're staff on another business account, so this account can't also build its own team.</p>
        <Button onClick={() => router.push("/provider")}>Back to Home</Button>
      </div>
    )
  }

  if (upgraded) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-lg font-semibold text-foreground">You're now a Business account</p>
        <p className="text-sm text-muted-foreground">Taking you to your Team Directory…</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Users className="h-6 w-6 text-primary" /> Build Your Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          As a Saji Pro subscriber, you can convert to a Business account to invite staff, dispatch jobs across your team, and track company-wide revenue. Your existing services, jobs, and reviews carry over unchanged.
        </p>
      </div>

      <Card className="border-0 p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground"><Building2 className="h-4 w-4" /> Convert to a Business Account</div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Business registration number</label>
          <Input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} placeholder="e.g. BN-2024-XXXXXX" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Company HQ address</label>
          <Input value={hqAddress} onChange={(e) => setHqAddress(e.target.value)} placeholder="Where is your business based?" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="h-11 w-full rounded-xl" disabled={isUpgrading || !registrationNumber.trim() || !hqAddress.trim()} onClick={handleUpgrade}>
          {isUpgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Convert & Start Building Your Team"}
        </Button>
      </Card>
    </div>
  )
}
