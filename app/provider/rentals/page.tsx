"use client"

import { useEffect, useState } from "react"
import { Package, Loader2, Crown, Truck, RotateCcw, Plus, ListChecks } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import Link from "next/link"
import {
  getMyRentalBookingsAsProvider, markRentalPickedUp, returnRentalBooking,
  type ProviderRentalBookingItem,
} from "@/lib/actions/rentals"
import { useLocalization } from "@/lib/hooks/useLocalization"

const BOOKING_STATUS_STYLE: Record<ProviderRentalBookingItem["status"], { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Pending Payment", className: "bg-muted text-muted-foreground" },
  CONFIRMED: { label: "Ready for Pickup", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  PICKED_UP: { label: "Out on Rental", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  RETURNED: { label: "Returned", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

// Rental *listings* are created and managed from the same Offer Creation
// Engine every other listing type uses (Admin > Categories' "Fields"
// aside, the wizard IS the listing CRUD now — see the Offer model's doc
// comment in schema.prisma for why rentals were folded in rather than kept
// as their own RentalListing model). This page is left as what's still
// genuinely rental-specific: running the actual pickup/return side of the
// business.
export default function RentalsPage() {
  const { formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [bookings, setBookings] = useState<ProviderRentalBookingItem[]>([])
  const [returningBooking, setReturningBooking] = useState<ProviderRentalBookingItem | null>(null)
  const [refundAmount, setRefundAmount] = useState("")
  const [refundNote, setRefundNote] = useState("")
  const [isReturning, setIsReturning] = useState(false)

  const refresh = async () => setBookings(await getMyRentalBookingsAsProvider())

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const activeBookingCount = bookings.filter((b) => b.status === "CONFIRMED" || b.status === "PICKED_UP").length
  const completedCount = bookings.filter((b) => b.status === "RETURNED").length

  const handlePickup = async (id: string) => {
    const result = await markRentalPickedUp({ id })
    if (!result.success) alert(result.error)
    await refresh()
  }

  const openReturnDialog = (booking: ProviderRentalBookingItem) => {
    setReturningBooking(booking)
    setRefundAmount(String(booking.depositAmount))
    setRefundNote("")
  }

  const handleReturn = async () => {
    if (!returningBooking) return
    setIsReturning(true)
    const result = await returnRentalBooking({ id: returningBooking.id, depositRefundAmount: Number(refundAmount) || 0, depositRefundNote: refundNote || undefined })
    setIsReturning(false)
    if (!result.success) { alert(result.error); return }
    setReturningBooking(null)
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground"><Package className="h-6 w-6 text-amber-500" /> Rental Bookings</h1>
          <p className="text-xs text-muted-foreground mt-1">Run the pickup and return side of your rental business.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="rounded-xl gap-2"><Link href="/provider/pro"><Crown className="w-4 h-4" />Saji Pro</Link></Button>
          <Button variant="outline" asChild className="rounded-xl gap-2"><Link href="/provider/offers"><ListChecks className="w-4 h-4" />My Listings</Link></Button>
          <Button asChild className="rounded-xl gap-2"><Link href="/provider/offers/new?actionType=RENT"><Plus className="w-4 h-4" />New Rental</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-xl font-bold text-foreground">{activeBookingCount}</p>
          <p className="text-[10px] text-muted-foreground">Active Bookings</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-xl font-bold text-foreground">{completedCount}</p>
          <p className="text-[10px] text-muted-foreground">Completed</p>
        </Card>
      </div>

      <div className="space-y-3">
        {bookings.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-xs text-muted-foreground">No rental bookings yet. Create a rental listing from My Listings to start taking bookings.</p>
          </Card>
        )}
        {bookings.map((booking) => (
          <Card key={booking.id} className="p-4 border border-border rounded-xl">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-foreground">{booking.listingTitle}</h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BOOKING_STATUS_STYLE[booking.status].className}`}>{BOOKING_STATUS_STYLE[booking.status].label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{booking.customerName} · {new Date(booking.startDate).toLocaleDateString()} – {new Date(booking.endDate).toLocaleDateString()} ({booking.days} day{booking.days > 1 ? "s" : ""})</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{booking.location}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-foreground">{formatMoney(booking.totalAmount)}</p>
                {booking.depositAmount > 0 && <p className="text-[10px] text-muted-foreground">incl. {formatMoney(booking.depositAmount)} deposit</p>}
                <div className="mt-2">
                  {booking.status === "CONFIRMED" && (
                    <Button size="sm" className="rounded-full gap-1.5" onClick={() => handlePickup(booking.id)}><Truck className="w-3.5 h-3.5" />Mark Picked Up</Button>
                  )}
                  {booking.status === "PICKED_UP" && (
                    <Button size="sm" variant="outline" className="rounded-full gap-1.5 bg-transparent" onClick={() => openReturnDialog(booking)}><RotateCcw className="w-3.5 h-3.5" />Mark Returned</Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Return / Deposit Refund Dialog */}
      <Dialog open={!!returningBooking} onOpenChange={(open) => !open && setReturningBooking(null)}>
        <DialogContent className="max-w-sm rounded-xl" showCloseButton={false}>
          {returningBooking && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-foreground">Mark as Returned</h2>
              <p className="text-xs text-muted-foreground">{returningBooking.listingTitle}, deposit paid: {formatMoney(returningBooking.depositAmount)}</p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Deposit to refund (KES)</label>
                <Input type="number" max={returningBooking.depositAmount} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="rounded-lg bg-card border-border" />
                <p className="text-[11px] text-muted-foreground mt-1">Refunded straight to the customer's Saji Wallet. Reduce this for damage or loss.</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Note (optional)</label>
                <Textarea value={refundNote} onChange={(e) => setRefundNote(e.target.value)} placeholder="e.g. Minor scratch on housing" className="rounded-lg bg-card border-border" />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setReturningBooking(null)} className="flex-1 rounded-xl" disabled={isReturning}>Cancel</Button>
                <Button onClick={handleReturn} disabled={isReturning} className="flex-1 rounded-xl">
                  {isReturning ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Return"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
