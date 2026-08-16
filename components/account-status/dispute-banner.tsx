"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, MessageCircle, Loader2 } from "lucide-react"
import type { MyOpenDispute } from "@/lib/actions/account-status"
import { getOrCreateAdminConversation } from "@/lib/actions/messages"

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_REVIEW: "Under review",
  ESCALATED: "Escalated",
}

export function DisputeBanner({ disputes, messagesBasePath }: { disputes: MyOpenDispute[]; messagesBasePath: string }) {
  const router = useRouter()
  const [isConnecting, setIsConnecting] = useState(false)

  if (disputes.length === 0) return null
  const latest = disputes[0]

  const handleContactAdmin = async () => {
    setIsConnecting(true)
    try {
      const result = await getOrCreateAdminConversation()
      if (result.success) router.push(`${messagesBasePath}?conversation=${result.conversationId}`)
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20 p-4">
      <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          {disputes.length > 1 ? `You have ${disputes.length} open disputes` : "You have an open dispute"}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
          Dispute #{latest.disputeNumber} &middot; {latest.reason} &middot; {STATUS_LABEL[latest.status] ?? latest.status}
        </p>
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
          Starting new bookings is restricted until this is resolved. Message admin support if you have questions.
        </p>
      </div>
      <button
        onClick={handleContactAdmin}
        disabled={isConnecting}
        className="flex-shrink-0 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {isConnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageCircle className="w-3.5 h-3.5" />}
        Message Admin
      </button>
    </div>
  )
}
