"use client"

import { useState } from "react"
import { Loader2, LogOut } from "lucide-react"
import { useAuth } from "@/frontend/lib/hooks/useAuth"
import { clearSessionHeartbeat } from "@/frontend/lib/session-heartbeat"
import { clearTillInstallCache } from "@/frontend/lib/pos-install-session"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/frontend/components/ui/alert-dialog"

export function PosLogoutButton({ navigation = false }: { navigation?: boolean }) {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const leave = async () => {
    if (busy) return
    setBusy(true); setError("")
    try {
      await logout()
      clearSessionHeartbeat()
      try {
        navigator.serviceWorker?.controller?.postMessage("logout")
        await Promise.race([clearTillInstallCache(), new Promise(resolve => setTimeout(resolve, 2000))])
      } catch { /* Cache support must not prevent leaving a signed-out workspace. */ }
      // Discard the authenticated React tree and router cache after the cookie is cleared.
      window.location.replace("/pos")
    } catch { setError("Could not log out. Please try again."); setBusy(false) }
  }

  return <AlertDialog open={open} onOpenChange={value => { if (!busy) { setOpen(value); setError("") } }}>
    <AlertDialogTrigger asChild>
      <button type="button" className={navigation ? "flex shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-3 text-[10px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 lg:w-16 lg:flex-col lg:gap-1.5 lg:px-1" : "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"}><LogOut className="h-4 w-4" />Log out</button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Log out of Till?</AlertDialogTitle><AlertDialogDescription>Park any unfinished basket before logging out. Logging out ends your account session; it does not close or count your shift.</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Stay signed in</AlertDialogCancel><button type="button" onClick={() => void leave()} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}Log out of Till</button></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
