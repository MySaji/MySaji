"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Copy, Check, X } from "lucide-react"
import { getMyProviderBusinessInfo, getMyStaff, inviteStaffMember, revokeStaffInvite, type MyStaffResult, type StaffInviteListItem } from "@/backend/actions/provider-business"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import type { TranslationKey } from "@/backend/domain/i18n"

const INVITE_STATUS_KEY: Record<StaffInviteListItem["status"], TranslationKey> = {
  PENDING: "provider.business.staff.statusPending",
  ACCEPTED: "provider.business.staff.statusAccepted",
  EXPIRED: "provider.business.staff.statusExpired",
  REVOKED: "provider.business.staff.statusRevoked",
}

export default function ManageStaffPage() {
  const { t } = useLocalization()
  const [isBusinessOwner, setIsBusinessOwner] = useState<boolean | null>(null)
  const [data, setData] = useState<MyStaffResult>({ staff: [], invites: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState("")
  const [inviteResultMessage, setInviteResultMessage] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function refresh() {
    const [info, staffResult] = await Promise.all([getMyProviderBusinessInfo(), getMyStaff()])
    setIsBusinessOwner(Boolean(info?.isBusinessOwner))
    setData(staffResult)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  async function handleInvite() {
    if (!email.trim() && !phone.trim()) return
    setIsInviting(true)
    setError("")
    setInviteResultMessage("")
    const result = await inviteStaffMember({ email, phone })
    setIsInviting(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setInviteResultMessage(result.emailed ? t("provider.business.staff.inviteSentEmail") : result.inviteUrl)
    setEmail("")
    setPhone("")
    await refresh()
  }

  async function handleRevoke(id: string) {
    await revokeStaffInvite({ id })
    await refresh()
  }

  async function copyLink(id: string, url: string) {
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      <div className="bg-blue-600 dark:bg-blue-700 text-white p-4 rounded-b-2xl lg:rounded-none">
        <div className="flex items-center gap-4 max-w-4xl mx-auto">
          <Link href="/provider" className="lg:hidden">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">{t("provider.business.staff.title")}</h1>
            <p className="text-blue-100 text-xs">{t("provider.business.staff.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl space-y-6">
        {!isBusinessOwner ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700 text-center text-gray-500 dark:text-gray-400">
            {t("provider.business.staff.notBusinessAccount")}
          </div>
        ) : (
          <>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("provider.business.staff.inviteFormTitle")}</h2>
              {error && <p className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</p>}
              {inviteResultMessage && <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3 break-all">{inviteResultMessage}</p>}
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("provider.business.staff.emailLabel")}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("provider.business.staff.phoneLabel")}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <button
                onClick={handleInvite}
                disabled={isInviting || (!email.trim() && !phone.trim())}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
              >
                {isInviting && <Loader2 className="w-4 h-4 animate-spin" />}
                {t("provider.business.staff.inviteButton")}
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("provider.business.staff.pendingInvitesTitle")}</h2>
              {data.invites.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.business.staff.noPendingInvites")}</p>}
              <div className="space-y-2">
                {data.invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                    <div className="min-w-0">
                      <p className="text-gray-900 dark:text-white font-medium truncate">{invite.email || invite.phone}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{t(INVITE_STATUS_KEY[invite.status])}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {invite.status === "PENDING" && (
                        <>
                          <button onClick={() => copyLink(invite.id, invite.inviteUrl)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1.5" title={t("provider.business.staff.copyLink")}>
                            {copiedId === invite.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button onClick={() => handleRevoke(invite.id)} className="text-red-600 hover:text-red-700 dark:text-red-400 p-1.5" title={t("provider.business.staff.revoke")}>
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border dark:border-gray-700">
              <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("provider.business.staff.teamTitle")}</h2>
              {data.staff.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{t("provider.business.staff.noStaffYet")}</p>}
              <div className="space-y-2">
                {data.staff.map((member) => (
                  <div key={member.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                    <div>
                      <p className="text-gray-900 dark:text-white font-medium">{member.name}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{member.email}{member.phone ? ` · ${member.phone}` : ""}</p>
                    </div>
                    {member.skills.length > 0 && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">{member.skills.slice(0, 2).join(", ")}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
