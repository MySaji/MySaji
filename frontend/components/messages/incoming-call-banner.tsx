"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { PhoneIncoming, X } from "lucide-react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { usePathname } from "next/navigation"
import { getIncomingCall } from "@/backend/actions/calls"
import { playNotificationSound } from "@/frontend/lib/notification-sound"

export function IncomingCallBanner() {
  const { user, isAuthenticated } = useAuthContext()
  const pathname = usePathname()
  const [active, setActive] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const { data } = useSWR(isAuthenticated && user?.id && !pathname.startsWith("/pos") ? ["incoming-call", user.id] : null, getIncomingCall, { refreshInterval: 5000, revalidateOnFocus: true })
  useEffect(() => { const receive = (event: Event) => setActive((event as CustomEvent<string | null>).detail); window.addEventListener("saji:chat-open", receive); return () => window.removeEventListener("saji:chat-open", receive) }, [])
  const visible = data && data.conversationId !== active && dismissed !== data.signalId
  useEffect(() => { if (visible) playNotificationSound() }, [visible, data?.signalId])
  if (!visible || !user) return null
  return <aside role="status" aria-label="Incoming call" className="fixed left-4 right-4 top-4 z-[80] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-blue-200 bg-white p-4 text-slate-950 shadow-xl dark:bg-slate-900 dark:text-white"><PhoneIncoming size={24} className="shrink-0 text-blue-700" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{data.name}</p><p className="text-xs text-muted-foreground">Incoming {data.video ? "video" : "audio"} call</p><Link href={`/${user.role}/messages?conversation=${encodeURIComponent(data.conversationId)}`} className="mt-2 inline-block text-sm font-semibold text-blue-700 underline">Open call to answer</Link></div><button onClick={() => setDismissed(data.signalId)} aria-label="Dismiss call banner" className="p-2"><X size={18} /></button></aside>
}
