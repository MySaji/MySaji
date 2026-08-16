"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, ShieldAlert, Home, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { BrandLogo } from "@/components/brand-logo"
import { useAuthContext } from "@/lib/auth-context"
import { getHouseholdInviteByToken, acceptHouseholdInvite, type HouseholdRole } from "@/lib/actions/household"

const ROLE_LABEL: Record<HouseholdRole, string> = { OWNER: "Owner", MEMBER: "Member", PROPERTY_MANAGER: "Property Manager", PAYMENT_APPROVER: "Payment Approver" }

export default function HouseholdInviteAcceptPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthContext()

  const [isChecking, setIsChecking] = useState(true)
  const [invalidReason, setInvalidReason] = useState<string | null>(null)
  const [householdName, setHouseholdName] = useState("")
  const [inviterName, setInviterName] = useState("")
  const [role, setRole] = useState<HouseholdRole>("MEMBER")

  const [isAccepting, setIsAccepting] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getHouseholdInviteByToken(params.token).then((result) => {
      setIsChecking(false)
      if (!result.valid) {
        setInvalidReason(result.error)
        return
      }
      setHouseholdName(result.householdName)
      setInviterName(result.inviterName)
      setRole(result.role)
    })
  }, [params.token])

  const handleAccept = async () => {
    setIsAccepting(true)
    setError("")
    const result = await acceptHouseholdInvite({ token: params.token })
    setIsAccepting(false)
    if (!result.success) { setError(result.error); return }
    setAccepted(true)
    setTimeout(() => router.push("/customer/household"), 1200)
  }

  if (isChecking || isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (invalidReason) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border-0 p-8 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-4 h-10 w-10 text-red-500" />
          <h1 className="mb-2 text-lg font-bold text-foreground">Invite not available</h1>
          <p className="mb-6 text-sm text-muted-foreground">{invalidReason}</p>
          <Link href="/customer/home" className="text-sm font-medium text-primary">Back to Saji</Link>
        </Card>
      </div>
    )
  }

  if (accepted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        <p className="text-lg font-semibold text-foreground">You've joined {householdName}</p>
        <p className="text-sm text-muted-foreground">Taking you to your household…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 p-8 shadow-sm">
        <div className="mb-6 flex justify-center"><BrandLogo /></div>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"><Home className="h-6 w-6 text-primary" /></div>
          <h1 className="text-xl font-bold text-foreground">Join {householdName}</h1>
          <p className="text-sm text-muted-foreground">
            {inviterName} invited you to join their household on SAJI as a <span className="font-semibold text-foreground">{ROLE_LABEL[role]}</span> — sharing bookings and service history.
          </p>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {isAuthenticated ? (
          <Button className="w-full rounded-xl" onClick={handleAccept} disabled={isAccepting}>
            {isAccepting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept invite"}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-center text-xs text-muted-foreground">Log in or create a SAJI account first, then come back to this link to accept.</p>
            <Button asChild className="w-full rounded-xl"><Link href="/auth/login">Log in</Link></Button>
            <Button asChild variant="outline" className="w-full rounded-xl bg-transparent"><Link href="/auth/signup">Create an account</Link></Button>
          </div>
        )}
      </Card>
    </div>
  )
}
