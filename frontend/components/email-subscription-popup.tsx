"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Mail, ShoppingBag, Wrench } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { NewsletterForm } from "@/frontend/components/newsletter-form"

const PRIVATE_ROUTES = ["/customer", "/provider", "/shopkeeper", "/admin", "/sub-admin", "/agent", "/secretary", "/distributor", "/auth", "/team-login", "/till-display", "/pos"]
export function EmailSubscriptionPopup() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [subscribed, setSubscribed] = useState(true)
  useEffect(() => {
    try { setSubscribed(Boolean(localStorage.getItem("saji_subscribed_email"))) } catch { setSubscribed(false) }
    const onSubscribe = () => setSubscribed(true)
    window.addEventListener("saji:subscribed", onSubscribe)
    return () => window.removeEventListener("saji:subscribed", onSubscribe)
  }, [])
  if (PRIVATE_ROUTES.some(prefix => pathname === prefix || pathname.startsWith(prefix + "/"))) return null
  return <>
    {!subscribed && <button onClick={() => setOpen(true)} aria-label="Get MySaji email updates" className="fixed bottom-24 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-800 shadow-lg hover:bg-blue-50 lg:bottom-28 lg:right-6"><Mail size={20} /></button>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto p-0 sm:max-w-lg">
      <div className="border-b-4 border-orange-500 bg-[#063b97] px-6 py-8 text-white"><Mail size={28} className="mb-5 text-orange-300" /><p className="mb-2 text-xs font-semibold tracking-widest">THE MYSAJI EDIT</p><DialogTitle className="text-2xl leading-tight text-white">Good finds. Useful updates.</DialogTitle><DialogDescription className="mt-3 text-sm leading-6 text-blue-100">A simple way to keep up with what?s new in the marketplace, without having to check every day.</DialogDescription></div>
      <div className="space-y-6 p-6"><div className="grid grid-cols-2 gap-4 text-sm"><p className="flex items-center gap-2"><ShoppingBag size={18} className="shrink-0 text-blue-700" />Product discoveries</p><p className="flex items-center gap-2"><Wrench size={18} className="shrink-0 text-orange-600" />Marketplace news</p></div><NewsletterForm /></div>
    </DialogContent></Dialog>
  </>
}
