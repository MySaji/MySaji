"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Home, Loader2, UserPlus, Trash2, Briefcase } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  getMyHousehold, createHousehold, inviteHouseholdMember, removeHouseholdMember, updateHouseholdMemberRole,
  getHouseholdJobs, type MyHousehold, type HouseholdRole, type HouseholdJobItem,
} from "@/lib/actions/household"
import { useLocalization } from "@/lib/hooks/useLocalization"

const ROLE_LABEL: Record<HouseholdRole, string> = { OWNER: "Owner", MEMBER: "Member", PROPERTY_MANAGER: "Property Manager", PAYMENT_APPROVER: "Payment Approver" }

export default function HouseholdPage() {
  const { formatMoney } = useLocalization()
  const [household, setHousehold] = useState<MyHousehold>(null)
  const [jobs, setJobs] = useState<HouseholdJobItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [householdName, setHouseholdName] = useState("")
  const [isCreating, setIsCreating] = useState(false)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"MEMBER" | "PROPERTY_MANAGER" | "PAYMENT_APPROVER">("MEMBER")
  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState("")
  const [inviteResultMessage, setInviteResultMessage] = useState("")

  const refresh = () => Promise.all([getMyHousehold().then(setHousehold), getHouseholdJobs().then(setJobs)])

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleCreate = async () => {
    setIsCreating(true)
    setError("")
    const result = await createHousehold({ name: householdName })
    setIsCreating(false)
    if (!result.success) { setError(result.error); return }
    await refresh()
  }

  const handleInvite = async () => {
    setIsInviting(true)
    setError("")
    const result = await inviteHouseholdMember({ email: inviteEmail, role: inviteRole })
    setIsInviting(false)
    if (!result.success) { setError(result.error); return }
    setShowInvite(false)
    setInviteEmail("")
    // SMTP isn't configured in every environment (dev/sandbox) — when the
    // email genuinely couldn't be sent, fall back to the raw link so the
    // owner can still share it manually instead of the invite silently
    // going nowhere.
    setInviteResultMessage(result.emailed ? "Invite sent! We emailed them a link to join." : `Email couldn't be sent. Share this link with them instead: ${result.inviteUrl}`)
    await refresh()
  }

  const handleRemove = async (memberId: string) => {
    if (!confirm("Remove this member from the household?")) return
    await removeHouseholdMember({ memberId })
    await refresh()
  }

  const handleRoleChange = async (memberId: string, role: "MEMBER" | "PROPERTY_MANAGER" | "PAYMENT_APPROVER") => {
    await updateHouseholdMemberRole({ memberId, role })
    await refresh()
  }

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full"><Link href="/customer/home"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div><h1 className="flex items-center gap-2 text-lg font-bold text-foreground"><Home className="h-5 w-5" /> Household</h1><p className="text-xs text-muted-foreground">Share bookings, properties, and history with family</p></div>
        </div>

        {!household ? (
          <Card className="border-0 p-6 shadow-sm space-y-4">
            <p className="text-xs text-muted-foreground">Set up a household to share service history and bookings with family members or a property manager.</p>
            <Input value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder="e.g. The Smith Household" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button className="w-full rounded-xl" onClick={handleCreate} disabled={isCreating || !householdName.trim()}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Household"}
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="border-0 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-foreground">{household.name}</h2>
                {household.isOwner && <Button size="sm" className="gap-1.5 rounded-lg" onClick={() => { setShowInvite(true); setError(""); setInviteResultMessage("") }}><UserPlus className="h-3.5 w-3.5" />Invite</Button>}
              </div>
              {inviteResultMessage && <p className="mb-3 break-all rounded-lg bg-emerald-500/10 p-3 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">{inviteResultMessage}</p>}
              <div className="space-y-2">
                {household.members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{m.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
                    </div>
                    {household.isOwner && m.role !== "OWNER" ? (
                      <div className="flex items-center gap-2">
                        <select value={m.role} onChange={(e) => handleRoleChange(m.id, e.target.value as any)} className="h-8 rounded-lg border border-border bg-background px-2 text-[11px]">
                          <option value="MEMBER">Member</option>
                          <option value="PROPERTY_MANAGER">Property Manager</option>
                          <option value="PAYMENT_APPROVER">Payment Approver</option>
                        </select>
                        <button onClick={() => handleRemove(m.id)} className="rounded-lg p-1.5 hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
                      </div>
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">{ROLE_LABEL[m.role]}</span>
                    )}
                  </div>
                ))}
                {household.invites.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border/70 p-3">
                    <p className="text-xs text-muted-foreground">{inv.email ?? inv.phone}, invited as {ROLE_LABEL[inv.role]}</p>
                    <span className="text-[10px] font-semibold text-amber-600">Pending</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-0 p-5 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground"><Briefcase className="h-4 w-4" /> Shared Service History</h3>
              {jobs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No bookings yet across your household.</p>
              ) : (
                <div className="space-y-2">
                  {jobs.slice(0, 10).map((j) => (
                    <div key={j.id} className="flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{j.title}</p>
                        <p className="text-[11px] text-muted-foreground">{j.bookedByName} · {new Date(j.scheduledDate).toLocaleDateString()}</p>
                      </div>
                      <span className="flex-shrink-0 font-semibold text-foreground">{formatMoney(j.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
          <div className="space-y-4">
            <h2 className="text-base font-bold text-foreground">Invite a Household Member</h2>
            <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email address" type="email" />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)} className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs">
              <option value="MEMBER">Member: view + book</option>
              <option value="PROPERTY_MANAGER">Property Manager: manage properties + book</option>
              <option value="PAYMENT_APPROVER">Payment Approver: view + book + approve payments</option>
            </select>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => setShowInvite(false)} disabled={isInviting}>Cancel</Button>
              <Button className="flex-1 rounded-xl" onClick={handleInvite} disabled={isInviting || !inviteEmail.trim()}>{isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Invite"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
