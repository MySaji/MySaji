"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Ban, MessageCircle, LogOut, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getOrCreateAdminConversation } from "@/lib/actions/messages"

export function AccountSuspendedScreen({ messagesBasePath, onLogout }: { messagesBasePath: string; onLogout: () => void }) {
  const router = useRouter()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleContactAdmin = async () => {
    setIsConnecting(true)
    setError(null)
    try {
      const result = await getOrCreateAdminConversation()
      if (!result.success) {
        setError(result.error)
        return
      }
      router.push(`${messagesBasePath}?conversation=${result.conversationId}`)
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.")
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="max-w-lg w-full rounded-[32px] border border-slate-200 bg-white p-10 shadow-2xl dark:border-gray-800 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400">
            <Ban className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Account Suspended</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Your account has been suspended by a platform administrator. This may be due to a policy violation or an
            ongoing investigation. Most features are unavailable while your account is in this state.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            If you believe this is a mistake or would like to appeal, message our admin support team directly — this
            is the fastest way to get your account reviewed and restored.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full mt-2">
            <Button onClick={handleContactAdmin} disabled={isConnecting} className="rounded-2xl px-6 py-3 w-full sm:w-auto">
              {isConnecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-2" />}
              Message Admin Support
            </Button>
            <Button variant="outline" onClick={onLogout} className="rounded-2xl px-6 py-3 w-full sm:w-auto">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
