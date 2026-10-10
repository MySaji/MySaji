"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Package, ClipboardList, Loader2, Crown, Plus, Check, MapPin, Truck, RotateCcw, Store, ShoppingBag, Edit2, Eye, EyeOff, Trash2, MessageCircle, XCircle } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent } from "@/frontend/components/ui/dialog"
import { getMyProducts, updateProductStock, getMyProductOrders, type MyProductItem, type MyProductOrderItem } from "@/backend/actions/provider-products"
import { acceptJob, completeJob, declineJob } from "@/backend/actions/provider-jobs"
import { publishOffer, unpublishOffer, deleteOffer } from "@/backend/actions/offers"
import { getMyRentalBookingsAsProvider, markRentalPickedUp, returnRentalBooking, cancelRentalBooking, type ProviderRentalBookingItem } from "@/backend/actions/rentals"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"
import { useProviderWorkspace } from "@/frontend/lib/hooks/useProviderWorkspace"
import { withTimeout } from "@/frontend/lib/swr-utils"

const RENTAL_STATUS_STYLE: Record<ProviderRentalBookingItem["status"], { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Pending Payment", className: "bg-muted text-muted-foreground" },
  CONFIRMED: { label: "Ready for Pickup", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  PICKED_UP: { label: "Out on Rental", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  RETURNED: { label: "Returned", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

const ORDER_STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  ACCEPTED: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  DISPUTED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

const TABS = [
  { key: "products" as const, label: "My Products", icon: Package },
  { key: "orders" as const, label: "Orders", icon: ClipboardList },
  { key: "rentals" as const, label: "Rentals", icon: Truck },
]

function EmptyState({ icon: Icon, title, desc }: { icon: typeof Package; title: string; desc: string }) {
  return (
    <Card className="border-dashed p-10 text-center flex flex-col items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">{desc}</p>
      </div>
    </Card>
  )
}

function StockEditor({ product, onSaved }: { product: MyProductItem; onSaved: (stock: number | null) => void }) {
  const { t } = useLocalization()
  const [value, setValue] = useState(product.stockQuantity == null ? "" : String(product.stockQuantity))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    const trimmed = value.trim()
    const stockQuantity = trimmed === "" ? null : Number(trimmed)
    if (stockQuantity != null && (!Number.isInteger(stockQuantity) || stockQuantity < 0)) {
      setError(t("provider.shop.invalidStock"))
      return
    }
    setIsSaving(true)
    setError("")
    const result = await updateProductStock({ offerId: product.offerId, stockQuantity })
    setIsSaving(false)
    if (!result.success) { setError(result.error); return }
    onSaved(stockQuantity)
  }

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("provider.shop.unlimitedPlaceholder")}
          className="h-8 min-w-0 flex-1 rounded-lg text-xs bg-card"
          disabled={isSaving}
        />
        <Button size="sm" variant="outline" onClick={save} disabled={isSaving} className="h-8 w-8 flex-shrink-0 rounded-lg px-0 bg-transparent">
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </Button>
      </div>
      {error && <p className="mt-1 text-[10px] text-red-600">{error}</p>}
    </div>
  )
}

export default function ProviderShopPage() {
  const { handleGateFailure } = useGatedAction()
  const { t, formatMoney } = useLocalization()
  // Reuses the same SWR-cached subscription check the sidebar's Team nav
  // item already fires (see useProviderWorkspace's own doc comment) instead
  // of firing a second, independent getMySubscriptionStatus() call here —
  // that duplicate was competing with the sidebar's for the same slow
  // query and losing the timeout race under load, which showed the
  // Pro-required screen to providers who genuinely were Pro.
  const { isPro, isLoading: workspaceLoading } = useProviderWorkspace()
  const [dataLoading, setDataLoading] = useState(true)
  const [tab, setTab] = useState<"products" | "orders" | "rentals">("products")
  const [products, setProducts] = useState<MyProductItem[]>([])
  const [orders, setOrders] = useState<MyProductOrderItem[]>([])
  const [orderActionId, setOrderActionId] = useState<string | null>(null)
  const [rentals, setRentals] = useState<ProviderRentalBookingItem[]>([])
  const [returningBooking, setReturningBooking] = useState<ProviderRentalBookingItem | null>(null)
  const [refundAmount, setRefundAmount] = useState("")
  const [refundNote, setRefundNote] = useState("")
  const [isReturning, setIsReturning] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Sequential, not Promise.all: both getMyProducts and getMyProductOrders
    // independently re-check Pro status server-side (each is its own
    // requirePro() gate, real security, can't be skipped) — firing them
    // concurrently doubled up on that same slow subscription lookup at
    // once and was enough contention on its own to blow the timeout budget.
    // One at a time costs a bit of latency, which this "lightweight panel"
    // can afford.
    // A longer budget than the usual DASHBOARD_FETCH_TIMEOUT_MS: each call
    // pays for its own requirePro() gate on top of the actual query (2-3 DB
    // round trips just to re-verify Pro status), so the combined cost can
    // approach the standard 25s budget before the real query even starts.
    const PRODUCTS_FETCH_TIMEOUT_MS = 45000
    withTimeout(getMyProducts(), PRODUCTS_FETCH_TIMEOUT_MS)
      .catch(() => [])
      .then((myProducts) => {
        if (cancelled) return []
        setProducts(myProducts)
        return withTimeout(getMyProductOrders(), PRODUCTS_FETCH_TIMEOUT_MS).catch(() => [])
      })
      .then((myOrders) => {
        if (cancelled) return []
        if (myOrders) setOrders(myOrders)
        // Rentals aren't Pro-gated server-side (getMyRentalBookingsAsProvider
        // is free for every provider), but this whole page already is — kept
        // sequential with the two calls above for the same reason: avoid
        // piling concurrent requests onto this environment's slow DB pooler.
        return withTimeout(getMyRentalBookingsAsProvider(), PRODUCTS_FETCH_TIMEOUT_MS).catch(() => [])
      })
      .then((myRentals) => {
        if (cancelled || !myRentals) return
        setRentals(myRentals)
      })
      .finally(() => { if (!cancelled) setDataLoading(false) })
    return () => { cancelled = true }
  }, [])

  const refreshRentals = async () => setRentals(await getMyRentalBookingsAsProvider())

  const handleRentalPickup = async (id: string) => {
    const result = await markRentalPickedUp({ id })
    if (!result.success) alert(result.error)
    await refreshRentals()
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
    await refreshRentals()
  }

  const handleCancelRental = async (booking: ProviderRentalBookingItem) => {
    if (!confirm(`Cancel this rental booking for "${booking.listingTitle}"? ${booking.status === "CONFIRMED" ? "The customer will be refunded in full." : ""}`)) return
    const result = await cancelRentalBooking({ id: booking.id })
    if (!result.success) { alert(result.error); return }
    await refreshRentals()
  }

  const isLoading = workspaceLoading || dataLoading

  const refreshProducts = async () => setProducts(await getMyProducts())

  const handleTogglePublish = async (p: MyProductItem) => {
    const result = p.status === "LIVE" ? await unpublishOffer({ id: p.offerId }) : await publishOffer({ id: p.offerId })
    if (!result.success) {
      // Only the publish direction can be refused for verification;
      // unpublishing stays open, so nobody is stuck with a live listing they
      // cannot take down. The rental and delete handlers above call ungated
      // actions and keep their plain alert.
      if (handleGateFailure(result)) return
      alert(result.error)
      return
    }
    await refreshProducts()
  }

  const handleDeleteProduct = async (p: MyProductItem) => {
    if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return
    const result = await deleteOffer({ id: p.offerId })
    if (!result.success) { alert(result.error); return }
    setProducts((prev) => prev.filter((x) => x.offerId !== p.offerId))
  }

  const handleOrderAction = async (job: MyProductOrderItem) => {
    setOrderActionId(job.jobId)
    const action = job.status === "PENDING" ? acceptJob : completeJob
    const result = await action({ jobId: job.jobId })
    setOrderActionId(null)
    if (!result.success) return
    setOrders((prev) =>
      prev.map((o) => (o.jobId === job.jobId ? { ...o, status: job.status === "PENDING" ? "ACCEPTED" : "COMPLETED" } : o)),
    )
  }

  const handleDeclineOrder = async (job: MyProductOrderItem) => {
    if (!confirm(`Decline this order from ${job.buyerName}?`)) return
    setOrderActionId(job.jobId)
    const result = await declineJob({ jobId: job.jobId })
    setOrderActionId(null)
    if (!result.success) { alert(result.error); return }
    setOrders((prev) => prev.map((o) => (o.jobId === job.jobId ? { ...o, status: "CANCELLED" } : o)))
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!isPro) {
    return (
      <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-6">
        <Card className="border border-border rounded-2xl p-6 sm:p-8 text-center space-y-5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Crown className="h-8 w-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-foreground">{t("provider.shop.proRequiredTitle")}</h1>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{t("provider.shop.proRequiredDesc")}</p>
          </div>
          <Link href="/provider/pro">
            <Button size="lg" className="rounded-xl font-semibold gap-2">
              <Crown className="w-4 h-4" />
              {t("provider.shop.upgradeToProButton")}
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  const liveProductCount = products.filter((p) => p.status === "LIVE").length
  const openOrderCount = orders.filter((o) => o.status === "PENDING" || o.status === "ACCEPTED" || o.status === "IN_PROGRESS").length
  const activeRentalCount = rentals.filter((r) => r.status === "CONFIRMED" || r.status === "PICKED_UP").length

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Store className="h-6 w-6 text-blue-500" /> {t("provider.shop.panelTitle")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{t("provider.shop.panelSubtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild className="rounded-xl gap-2 bg-transparent"><Link href="/provider/pro"><Crown className="w-4 h-4 text-amber-500" />Saji Pro</Link></Button>
          {tab === "products" && (
            <Button asChild className="rounded-xl gap-2"><Link href="/provider/offers"><Plus className="w-4 h-4" />{t("provider.shop.addProductButton")}</Link></Button>
          )}
          {tab === "rentals" && (
            <Button asChild className="rounded-xl gap-2"><Link href="/provider/offers/new?actionType=RENT"><Plus className="w-4 h-4" />New Rental Listing</Link></Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-xl font-bold text-foreground">{liveProductCount}</p>
          <p className="text-[10px] text-muted-foreground">Live Products</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-xl font-bold text-foreground">{openOrderCount}</p>
          <p className="text-[10px] text-muted-foreground">Open Orders</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <p className="text-xl font-bold text-foreground">{activeRentalCount}</p>
          <p className="text-[10px] text-muted-foreground">Active Rentals</p>
        </Card>
      </div>

      <div className="flex gap-1.5 rounded-full bg-muted p-1 w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${tab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "products" && (
        <div className="space-y-3">
          {products.length === 0 ? (
            <EmptyState icon={Package} title={t("provider.shop.noProductsYet")} desc={t("provider.shop.noProductsYetDesc")} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {products.map((p) => (
                <Card key={p.offerId} className="overflow-hidden border border-border rounded-2xl py-0 gap-0 hover:shadow-md transition-shadow">
                  <div className="relative aspect-square w-full bg-muted">
                    {p.image ? (
                      <Image src={p.image} alt="" fill className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Package className="h-8 w-8" /></div>
                    )}
                    <span className={`absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${p.status === "LIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-white/90 text-muted-foreground dark:bg-black/60"}`}>
                      {p.status}
                    </span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <p className="truncate text-sm font-semibold text-foreground">{p.title}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-semibold text-foreground">{p.price != null ? formatMoney(p.price) : t("common.viewDetails")}</span>
                        <span>· {t("provider.shop.soldCount", { count: p.bookingCount })}</span>
                      </div>
                    </div>
                    <div className="border-t border-border/70 pt-2 space-y-2">
                      <div className="flex items-center gap-1">
                        <Link href={`/provider/offers/new?id=${p.offerId}`} title="Edit" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                          <Edit2 className="h-3.5 w-3.5" />
                        </Link>
                        <button onClick={() => handleTogglePublish(p)} title={p.status === "LIVE" ? "Unpublish" : "Publish"} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                          {p.status === "LIVE" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-primary" />}
                        </button>
                        <button onClick={() => handleDeleteProduct(p)} title="Delete" className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground">{t("provider.shop.stockLabel")}</span>
                        <StockEditor product={p} onSaved={(stock) => setProducts((prev) => prev.map((x) => (x.offerId === p.offerId ? { ...x, stockQuantity: stock } : x)))} />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-2">
          {orders.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={t("provider.shop.noOrdersYet")} desc={t("provider.shop.noOrdersYetDesc")} />
          ) : (
            orders.map((o) => (
              <Card key={o.jobId} className="p-3.5 border border-border rounded-2xl gap-0 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-muted">
                      {o.buyerAvatar && <Image src={o.buyerAvatar} alt="" fill className="object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-foreground">{o.buyerName}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{o.productTitle} × {o.quantity}</p>
                    </div>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ORDER_STATUS_STYLE[o.status] ?? "bg-muted text-muted-foreground"}`}>
                    {o.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/70 pt-2.5">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{o.location}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-xs font-bold text-primary mr-1">{formatMoney(o.price)}</span>
                    <Link href={`/provider/messages?client=${o.buyerId}&action=message`} title="Message buyer" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </Link>
                    {o.status === "PENDING" && (
                      <button
                        onClick={() => handleDeclineOrder(o)}
                        disabled={orderActionId === o.jobId}
                        title="Decline order"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {(o.status === "PENDING" || o.status === "ACCEPTED" || o.status === "IN_PROGRESS") && (
                      <Button
                        size="sm"
                        onClick={() => handleOrderAction(o)}
                        disabled={orderActionId === o.jobId}
                        className="h-7 rounded-lg px-2.5 text-[11px]"
                      >
                        {orderActionId === o.jobId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : o.status === "PENDING" ? (
                          t("provider.shop.acceptOrderButton")
                        ) : (
                          t("provider.shop.markFulfilledButton")
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "rentals" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Link href="/provider/rentals" className="text-[11px] font-medium text-primary hover:underline">
              Open the full Rentals page →
            </Link>
          </div>

          {rentals.length === 0 ? (
            <EmptyState icon={Truck} title="No rental bookings yet" desc="Create a rental listing to start taking bookings on items you rent out." />
          ) : (
            <div className="space-y-2">
              {rentals.map((booking) => (
                <Card key={booking.id} className="p-3.5 border border-border rounded-2xl gap-0 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold text-foreground">{booking.listingTitle}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${RENTAL_STATUS_STYLE[booking.status].className}`}>{RENTAL_STATUS_STYLE[booking.status].label}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{booking.customerName} · {new Date(booking.startDate).toLocaleDateString()} – {new Date(booking.endDate).toLocaleDateString()} ({booking.days} day{booking.days > 1 ? "s" : ""})</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{booking.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-foreground">{formatMoney(booking.totalAmount)}</p>
                      {booking.depositAmount > 0 && <p className="text-[10px] text-muted-foreground">incl. {formatMoney(booking.depositAmount)} deposit</p>}
                      <div className="mt-2">
                        {booking.status === "CONFIRMED" && (
                          <Button size="sm" className="rounded-full gap-1.5" onClick={() => handleRentalPickup(booking.id)}><Truck className="w-3.5 h-3.5" />Mark Picked Up</Button>
                        )}
                        {booking.status === "PICKED_UP" && (
                          <Button size="sm" variant="outline" className="rounded-full gap-1.5 bg-transparent" onClick={() => openReturnDialog(booking)}><RotateCcw className="w-3.5 h-3.5" />Mark Returned</Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 border-t border-border/70 pt-2.5">
                    <Link href={`/provider/offers/new?id=${booking.offerId}`} title="Edit listing" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </Link>
                    <Link href={`/provider/messages?client=${booking.customerId}&action=message`} title="Message customer" className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </Link>
                    {booking.status === "CONFIRMED" && (
                      <button onClick={() => handleCancelRental(booking)} title="Cancel booking" className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

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
