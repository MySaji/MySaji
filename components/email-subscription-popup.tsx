'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Mail, Percent, Package, Bell, TrendingUp, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'

// Signed-in staff/portal users are already deep in their own dashboard —
// a "subscribe to our newsletter" nudge doesn't make sense there, only on
// the public marketing site and other unauthenticated pages.
const PORTAL_PREFIXES = ['/customer', '/provider', '/shopkeeper', '/admin', '/sub-admin', '/agent', '/secretary']

const DEVICE_ID_KEY = 'saji_device_id'
const SUBSCRIBED_KEY = 'saji_subscribed_email'

const BENEFITS = [
  { icon: Percent, label: 'Exclusive deals' },
  { icon: Package, label: 'New arrivals' },
  { icon: Bell, label: 'Restock alerts' },
  { icon: TrendingUp, label: 'Trending picks' },
]

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  // crypto.randomUUID() only exists in secure contexts (HTTPS, or exactly
  // localhost/127.0.0.1) — on a plain-HTTP LAN address (e.g. the dev
  // server's own "Network: http://192.168.x.x:3000" URL) it's undefined
  // and throws. deviceId is a soft analytics field, not security-sensitive,
  // so a plain random string works everywhere instead.
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(DEVICE_ID_KEY, id)
  return id
}

/** A small shaking mail icon docked above the floating chat button, instead
 * of a modal that used to auto-open on a timer on every page. Only the icon
 * is unsolicited; the actual subscribe form only appears once the visitor
 * taps it, and the icon itself disappears for good once they've subscribed
 * (same localStorage flag as before gates that, per-browser). */
export function EmailSubscriptionPopup() {
  const pathname = usePathname()
  const isPortalRoute = PORTAL_PREFIXES.some((prefix) => pathname?.startsWith(prefix))

  const [open, setOpen] = useState(false)
  // Starts hidden so server/first paint never flashes the icon for visitors
  // who already subscribed on this browser — flips to false (shown) after
  // the localStorage check below, only for those who haven't.
  const [isSubscribed, setIsSubscribed] = useState(true)
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    if (isPortalRoute) return
    setIsSubscribed(Boolean(localStorage.getItem(SUBSCRIBED_KEY)))
  }, [isPortalRoute])

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return re.test(email)
  }

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateEmail(email)) {
      setMessageType('error')
      setMessage('Please enter a valid email address')
      return
    }

    setIsLoading(true)
    setMessage('')

    try {
      const deviceId = getOrCreateDeviceId()
      const response = await fetch('/api/subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, deviceId }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result?.error || 'Failed to subscribe')

      localStorage.setItem(SUBSCRIBED_KEY, email)
      setIsSubscribed(true)
      setMessageType('success')
      setMessage(
        result.alreadySubscribed
          ? "You're already subscribed, thanks for being with us!"
          : "You're subscribed! Check your inbox for a welcome email, then look out for weekly product updates and trending picks.",
      )
      setEmail('')

      setTimeout(() => {
        setOpen(false)
        setMessage('')
      }, 3500)
    } catch (err) {
      setMessageType('error')
      setMessage(err instanceof Error ? err.message : 'Failed to subscribe. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isPortalRoute || isSubscribed) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Subscribe for exclusive deals and updates"
        title="Subscribe for exclusive deals and updates"
        className="fixed bottom-24 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110 animate-shake-nudge sm:h-12 sm:w-12 lg:bottom-28 lg:right-6"
      >
        <Mail className="h-5 w-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[85vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-2xl p-0 gap-0 shadow-2xl sm:max-w-sm"
        >
          {/* Gradient header — on-brand instead of a plain white modal top */}
          <div className="relative bg-gradient-to-br from-primary via-primary to-primary/80 px-5 pt-6 pb-7 text-center text-primary-foreground sm:px-6 sm:pt-7 sm:pb-8">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-2.5 right-2.5 rounded-full p-1.5 text-primary-foreground/80 hover:bg-white/15 hover:text-primary-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm sm:h-12 sm:w-12">
              <Mail className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <DialogTitle className="text-lg font-bold text-primary-foreground sm:text-xl">Stay in the loop</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-primary-foreground/80 text-balance sm:text-sm">
              Weekly product updates, trending picks, and exclusive offers, straight to your inbox
            </DialogDescription>
          </div>

          <div className="px-5 pt-4 pb-5 bg-card sm:px-6 sm:pt-5 sm:pb-6">
            <div className="grid grid-cols-4 gap-1.5 mb-4 sm:gap-2">
              {BENEFITS.map((b) => (
                <div key={b.label} className="rounded-lg border border-border bg-background px-1 py-2 text-center shadow-sm">
                  <b.icon className="mx-auto mb-1 h-3.5 w-3.5 text-primary" />
                  <p className="text-[9px] font-medium leading-tight text-foreground">{b.label}</p>
                </div>
              ))}
            </div>

            <form onSubmit={handleSubscribe} className="space-y-2.5">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                className="h-10 rounded-xl text-sm sm:h-11 sm:text-base"
              />

              {message && (
                <div
                  className={`rounded-xl px-3 py-2 text-xs font-medium sm:text-sm ${
                    messageType === 'success'
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                  }`}
                >
                  {message}
                </div>
              )}

              <Button type="submit" disabled={isLoading || !email} className="h-10 w-full rounded-xl font-semibold sm:h-11">
                {isLoading ? 'Subscribing...' : 'Subscribe Now'}
              </Button>

              <p className="text-center text-[11px] text-muted-foreground sm:text-xs">We respect your privacy. Unsubscribe anytime.</p>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
