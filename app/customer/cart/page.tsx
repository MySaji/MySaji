"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/frontend/components/ui/dialog"
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, MapPin, Loader2, Clock, Tag, X, Wrench, CalendarClock, Package, CheckCircle2, RefreshCw, Store, ShieldCheck } from "lucide-react"
import { getCart, updateCartItemQuantity, removeCartItem, removeServiceCartItem, updateOfferCartItemQuantity, removeOfferCartItem, checkout, type CartLine, type CartActionResult } from "@/backend/actions/cart"
import { revalidateCartCount } from "@/frontend/lib/hooks/useCartCount"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"
import { getEffectivePlatformPreferences } from "@/backend/actions/admin-settings"
import { getWalletSummary } from "@/backend/actions/wallet"
import { validatePromoCode } from "@/backend/actions/promo"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { AddressAutocompleteInput } from "@/frontend/components/maps/address-autocomplete-input"

export default function CustomerCartPage() {
  const { t, formatMoney } = useLocalization()
  const { handleGateFailure } = useGatedAction()
  const [cart, setCart] = useState<CartLine[]>([])
  const [walletBalance, setWalletBalance] = useState(0)
  const [appPayments, setAppPayments] = useState(false)
  const [paymentChoice, setPaymentChoice] = useState<"DIRECT" | "WALLET">("DIRECT")
  const direct = paymentChoice === "DIRECT"
  const [shippingAddress, setShippingAddress] = useState("")
  const [shippingCoords, setShippingCoords] = useState<{ shippingLatitude: number; shippingLongitude: number } | null>(null)
  const [shippingPhone, setShippingPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const quoteVersion = useRef(0)
  const lock = useRef(false)
  const [review, setReview] = useState(false)
  const [receipt, setReceipt] = useState<{ amount: number; orders: number; jobs: number; paymentMode: "DIRECT" | "WALLET" } | null>(null)
  const [promoCode, setPromoCode] = useState("")
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; shopName: string; discountAmount: number } | null>(null)
  const [promoError, setPromoError] = useState("")
  const [isApplyingPromo, setIsApplyingPromo] = useState(false)

  const refresh = useCallback(async () => {
    const version = ++quoteVersion.current
    setLoadError(""); setQuoting(true)
    try {
      const [items, policy] = await Promise.all([getCart(shippingCoords ? {latitude:shippingCoords.shippingLatitude,longitude:shippingCoords.shippingLongitude} : undefined), getEffectivePlatformPreferences()])
      const enabled = policy.customerAppPaymentsEnabled && policy.jobPaymentMode !== "DIRECT"
      const wallet = enabled ? await getWalletSummary() : null
      if (version === quoteVersion.current) { setCart(items); setAppPayments(enabled); setWalletBalance(wallet?.balance ?? 0); if (!enabled) setPaymentChoice("DIRECT") }
    } catch { if (version === quoteVersion.current) setLoadError("We couldn't load your cart or delivery quote. Please try again.") }
    finally { if (version === quoteVersion.current) { setIsLoading(false); setQuoting(false) } }
  }, [shippingCoords])
  useEffect(() => { void refresh() }, [refresh])

  const products = cart.filter(item => item.kind === "product")
  const services = cart.filter(item => item.kind === "service")
  const deliveries = useMemo(() => {
    const shops = new Map<string, { name: string; fee: number }>()
    for (const item of cart) if (item.kind === "product") shops.set(item.shopId || item.shop, { name: item.shop, fee: item.shopDeliveryFee })
    return [...shops.values()]
  }, [cart])
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const shipping = deliveries.reduce((sum, shop) => sum + shop.fee, 0)
  const discount = appliedPromo?.discountAmount ?? 0
  const total = Math.max(0, subtotal + shipping - discount)
  const unavailable = cart.filter(item => item.kind === "product" ? item.shopIsOnVacation || !!item.deliveryError || item.quantity > item.stock : item.kind === "offer" && item.stock != null && item.quantity > item.stock)
  const shortfall = Math.max(0, total - walletBalance)
  const detailsReady = shippingAddress.trim().length > 0 && shippingPhone.trim().length >= 7
  const canCheckout = cart.length > 0 && !loadError && !busy && !quoting && !isApplyingPromo && !isSubmitting && (direct || shortfall === 0) && unavailable.length === 0 && detailsReady

  const currentStep = receipt || review ? 2 : detailsReady ? 1 : 0

  const changeCart = async (action: () => Promise<CartActionResult>, message: string) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(""); setNotice("")
    try {
      const result = await action()
      if (!result.success) { setError(result.error); return }
      // Cart changes invalidate a previously calculated promotion.
      setAppliedPromo(null); setPromoError("")
      setCart(await getCart(shippingCoords ? {latitude:shippingCoords.shippingLatitude,longitude:shippingCoords.shippingLongitude} : undefined)); void revalidateCartCount(); setNotice(message)
    } catch { setError("We couldn't update your cart. Refresh to check the latest items before trying again.") }
    finally { lock.current = false; setBusy(false) }
  }
  const remove = (item: CartLine) => changeCart(() => item.kind === "product" ? removeCartItem({ productId: item.productId }) : item.kind === "offer" ? removeOfferCartItem({ cartItemId: item.cartItemId }) : removeServiceCartItem({ cartItemId: item.cartItemId }), "Item removed from your cart.")
  const quantity = (item: CartLine, value: number) => changeCart(() => item.kind === "product" ? updateCartItemQuantity({ productId: item.productId, quantity: value }) : item.kind === "offer" ? updateOfferCartItemQuantity({ cartItemId: item.cartItemId, quantity: value }) : Promise.resolve({ success: false, error: "This service has a fixed booking quantity." }), "Quantity updated. Reapply any promotion to check the new discount.")
  const applyPromo = async () => {
    if (lock.current || !promoCode.trim()) return
    lock.current = true; setIsApplyingPromo(true); setPromoError("")
    try {
      const result = await validatePromoCode(promoCode.trim())
      if (!result.success) { setAppliedPromo(null); setPromoError(result.error); return }
      setAppliedPromo({ code: promoCode.trim(), shopName: result.shopName, discountAmount: result.discountAmount })
    } catch { setPromoError("We couldn't check this code. Please try again.") }
    finally { lock.current = false; setIsApplyingPromo(false) }
  }
  const pay = async () => {
    if (lock.current || !canCheckout) return
    lock.current = true; setIsSubmitting(true); setError("")
    try {
      const result = await checkout({ shippingAddress: shippingAddress.trim(), shippingPhone: shippingPhone.trim(), notes, promoCode: appliedPromo?.code, expectedTotal: total, paymentChoice, ...(shippingCoords ?? {}) })
      if (!result.success) { if (handleGateFailure(result)) { setReview(false); return }; setError(result.error); return }
      setReceipt({ amount: result.totalAmount, orders: result.orderIds.length, jobs: result.jobIds.length, paymentMode: result.paymentMode })
      setReview(false); setCart([]); setAppliedPromo(null); void revalidateCartCount()
    } catch { setError("We couldn't confirm the checkout result. Check your orders before trying again.") }
    finally { lock.current = false; setIsSubmitting(false) }
  }

  if (isLoading) return <div role="status" className="flex min-h-96 items-center justify-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-blue-700" />Loading your cart…</div>
  return <div className="min-h-screen bg-slate-50/70 pb-8 dark:bg-background">
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-800 dark:text-blue-300">Your next good find</p><h1 className="text-3xl font-semibold tracking-tight">{t("customer.cart.title")}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Review your items, confirm delivery and arrange payment directly with each owner.</p></div>
        <Link href="/customer/services" className="inline-flex min-h-11 items-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium">Continue exploring<ArrowRight size={16} /></Link>
      </header>
      <div className="mb-6 grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 text-xs sm:gap-4 sm:p-4 sm:text-sm" aria-label="Checkout progress">
        {["Review cart", "Contact & address", "Confirm order"].map((step, i) => <div key={step} aria-current={i === currentStep ? "step" : undefined} className="flex items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-semibold ${i === currentStep ? "bg-blue-800 text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</span><span>{step}</span></div>)}
      </div>
      {loadError && <Card className="mb-5 border-red-200 p-5"><p role="alert">{loadError}</p><Button variant="outline" className="mt-3" onClick={refresh}><RefreshCw size={16} />Retry</Button></Card>}
      {error && !review && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
      <p role="status" className="sr-only">{notice}</p>
      {receipt ? <Card className="mx-auto max-w-2xl p-6 sm:p-10"><CheckCircle2 className="mb-5 h-12 w-12 text-blue-700" /><h2 className="text-2xl font-semibold">Checkout complete</h2><p className="mt-3 leading-7 text-muted-foreground">{formatMoney(receipt.amount)} {receipt.paymentMode === "DIRECT" ? "to be paid directly to the owners. No app payment was taken." : "paid from your wallet."} Your checkout created {receipt.orders} product order(s) and {receipt.jobs} service booking(s).</p><div className="mt-6 flex flex-wrap gap-3">{receipt.orders > 0 && <Button asChild><Link href="/customer/orders">View orders</Link></Button>}{receipt.jobs > 0 && <Button asChild variant="outline"><Link href="/customer/jobs">View bookings</Link></Button>}{receipt.paymentMode === "WALLET" && <Button asChild variant="outline"><Link href="/customer/wallet">View wallet</Link></Button>}</div></Card>
      : !loadError && cart.length === 0 ? <Card className="mx-auto max-w-2xl p-8 text-center sm:p-14"><ShoppingCart className="mx-auto mb-5 h-12 w-12 text-blue-700" /><h2 className="text-2xl font-semibold">{t("customer.cart.emptyTitle")}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Products, professional offers and service bookings can all live here until you’re ready.</p><Button asChild className="mt-6"><Link href="/customer/services">Explore products & services<ArrowRight size={16} /></Link></Button></Card>
      : <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section aria-labelledby="cart-items" className="space-y-3"><button disabled={busy || quoting || isSubmitting} onClick={() => {setAppliedPromo(null);void refresh()}} className="inline-flex min-h-11 items-center gap-2 text-sm text-blue-800 dark:text-blue-300"><RefreshCw size={15} />Refresh cart</button><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="cart-items" className="text-lg font-semibold">Your items <span className="font-normal text-muted-foreground">({cart.reduce((sum, item) => sum + item.quantity, 0)})</span></h2><span className="text-xs text-muted-foreground">{products.length} product · {services.length} service · {cart.filter(item => item.kind === "offer").length} offer</span></div>
            {cart.map(item => { const key = item.kind === "product" ? item.productId : item.cartItemId; const stock = item.kind === "service" ? null : item.stock; return <Card key={key} className="overflow-hidden p-4 sm:p-5"><div className="flex items-start gap-3 sm:gap-5"><div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-slate-50 sm:h-24 sm:w-24">{item.image ? <Image src={item.image} alt={item.name} fill sizes="96px" className="object-contain p-1" /> : item.kind === "service" ? <Wrench className="text-blue-700" /> : <Package className="text-blue-700" />}</div><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300">{item.kind === "service" ? "Service booking" : item.kind === "offer" ? "Pro offer" : "Shop product"}</p><h3 className="mt-1 break-words text-base font-semibold">{item.name}</h3><p className="mt-1 text-sm text-muted-foreground">{item.kind === "product" ? item.shop : item.providerName}</p><p className="mt-2 text-sm font-medium">{formatMoney(item.price)} <span className="font-normal text-muted-foreground">each</span></p></div><button disabled={busy || quoting || isSubmitting || isApplyingPromo} onClick={() => remove(item)} aria-label={`Remove ${item.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-700 disabled:opacity-40"><Trash2 size={18} /></button></div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">{item.kind === "service" ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarClock size={16} className="shrink-0" />{new Date(item.scheduledDate).toLocaleString()} · Qty {item.quantity}</p> : <div className="flex items-center gap-3"><div className="inline-flex items-center rounded-lg border"><button className="flex h-11 w-11 items-center justify-center disabled:opacity-30" aria-label={`Decrease ${item.name} quantity`} disabled={busy || quoting || isSubmitting || isApplyingPromo || item.quantity <= 1} onClick={() => quantity(item, item.quantity - 1)}><Minus size={16} /></button><span className="min-w-8 text-center text-sm font-semibold" aria-live="polite">{item.quantity}</span><button className="flex h-11 w-11 items-center justify-center disabled:opacity-30" aria-label={`Increase ${item.name} quantity`} disabled={busy || quoting || isSubmitting || isApplyingPromo || item.quantity >= 99 || (stock != null && item.quantity >= stock)} onClick={() => quantity(item, item.quantity + 1)}><Plus size={16} /></button></div>{stock != null && <span className={`text-xs ${item.quantity > stock ? "text-red-700" : "text-muted-foreground"}`}>{stock === 0 ? "Out of stock" : `${stock} available`}</span>}</div>}<strong className="ml-auto text-base">{formatMoney(item.price * item.quantity)}</strong></div>
              {item.kind === "product" && item.deliveryError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{item.deliveryError}</p>}
              {item.kind === "service" && item.notes && <p className="mt-3 break-words text-sm text-muted-foreground">Booking note: {item.notes}</p>}
              {item.kind === "product" && (item.shopIsOnVacation || !item.shopIsOpen) && <p className={`mt-3 flex items-start gap-2 rounded-lg p-3 text-sm ${item.shopIsOnVacation ? "bg-red-50 text-red-800" : "bg-orange-50 text-orange-900"}`}><Clock size={16} className="mt-0.5 shrink-0" /><span>{item.shopIsOnVacation ? `${item.shop} is not accepting orders. ${item.shopVacationNote || "Remove this item to continue."}` : `${item.shop} is currently closed. ${item.shopNextOpeningLabel || "Processing may begin when the shop reopens."}`}</span></p>}
            </Card>})}
          </section>
          {deliveries.length > 0 && <Card className="p-5"><h2 className="flex items-center gap-2 text-base font-semibold"><Store size={18} className="text-blue-700" />Delivery by shop</h2><p className="mt-2 text-sm text-muted-foreground">Delivery is charged once for each shop in this cart.</p><div className="mt-4 space-y-3">{deliveries.map((shop,i) => <div key={i} className="flex justify-between gap-3 text-sm"><span>{shop.name}</span><span className="shrink-0">{shop.fee ? formatMoney(shop.fee) : "No delivery charge"}</span></div>)}</div></Card>}
          <Card className="p-5 sm:p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin size={20} className="text-blue-700" />Contact & address</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{products.length ? "Where should your products be delivered?" : "Where will the service take place?"} Your supplier will use these details to coordinate with you.</p><div className="mt-5 space-y-4"><div><label htmlFor="checkout-phone" className="mb-2 block text-sm font-medium">Contact phone <span className="text-muted-foreground">(required)</span></label><Input id="checkout-phone" type="tel" autoComplete="tel" placeholder="e.g. 0712 345 678" value={shippingPhone} disabled={isSubmitting || busy} onChange={event => setShippingPhone(event.target.value)} /></div><div><p id="checkout-address-label" className="mb-2 text-sm font-medium">Delivery or service address <span className="text-muted-foreground">(required)</span></p><div role="group" aria-labelledby="checkout-address-label"><AddressAutocompleteInput ariaLabel="Delivery or service address" value={shippingAddress} disabled={isSubmitting || busy} onChange={value => {setShippingAddress(value); setShippingCoords(null)}} onPlaceSelected={place => {setShippingAddress(place.address); setShippingCoords({shippingLatitude:place.latitude,shippingLongitude:place.longitude})}} placeholder="Building, street, area and town" /></div><p className="mt-2 text-xs text-muted-foreground">Select an address suggestion when available so delivery coverage can be checked.</p></div><div><label htmlFor="checkout-notes" className="mb-2 block text-sm font-medium">Delivery or access notes <span className="text-muted-foreground">(optional)</span></label><Textarea id="checkout-notes" value={notes} disabled={isSubmitting || busy} onChange={event => setNotes(event.target.value)} placeholder="Landmark, gate instructions or a useful detail for your provider" maxLength={2000} /></div></div></Card>
        </div>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6" aria-label="Order summary"><Card className="overflow-hidden"><div className="border-b-4 border-orange-500 bg-blue-900 p-5 text-white"><p className="text-xs font-medium uppercase tracking-widest text-blue-100">Ready when you are</p><h2 className="mt-2 text-xl font-semibold">Order summary</h2></div><div className="space-y-5 p-5"><div className="rounded-xl border bg-muted/50 p-4"><p className="font-semibold">Pay the owner directly</p><p className="mt-2 text-sm leading-6 text-muted-foreground">Confirm each seller's M-Pesa number, till/paybill, bank details or cash arrangement in Messages. MySaji does not collect this payment or verify an outside transfer.</p>{appPayments && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!direct} onChange={event => setPaymentChoice(event.target.checked ? "WALLET" : "DIRECT")} />Pay using my MySaji wallet instead</label>}{!direct && <><p className="mt-2 text-sm">Wallet: {formatMoney(walletBalance)}</p><Link href="/customer/wallet" className="text-sm underline">{shortfall > 0 ? `Add ${formatMoney(shortfall)}` : "Manage wallet"}</Link></>}</div><div><label htmlFor="cart-promo" className="mb-2 flex items-center gap-2 text-sm font-medium"><Tag size={16} />Promo code</label>{appliedPromo ? <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900"><span>{appliedPromo.code} · {appliedPromo.shopName}</span><button aria-label="Remove promo code" className="p-2" onClick={() => {setAppliedPromo(null);setPromoCode("")}} disabled={isSubmitting}><X size={16} /></button></div> : <div className="flex gap-2"><Input id="cart-promo" value={promoCode} disabled={isSubmitting || busy || isApplyingPromo} onChange={event => {setPromoCode(event.target.value);setPromoError("")}} placeholder="Enter code" /><Button variant="outline" disabled={!promoCode.trim() || busy || quoting || isSubmitting || isApplyingPromo} onClick={applyPromo}>{isApplyingPromo ? <Loader2 size={16} className="animate-spin" /> : "Apply"}</Button></div>}{promoError && <p role="alert" className="mt-2 text-sm text-red-700">{promoError}</p>}</div><dl className="space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatMoney(subtotal)}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Delivery</dt><dd>{formatMoney(shipping)}</dd></div>{discount > 0 && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Promotion</dt><dd className="text-blue-800">−{formatMoney(discount)}</dd></div>}<div className="flex justify-between gap-3 border-t pt-4 text-lg font-semibold"><dt>Total</dt><dd>{formatMoney(total)}</dd></div></dl>{unavailable.length > 0 && <p role="alert" className="text-sm text-red-700">Resolve delivery restrictions, unavailable items or quantities before paying.</p>}{!detailsReady && <p className="text-sm text-muted-foreground">Add a contact phone and address to continue.</p>}<Button className="min-h-12 w-full bg-blue-800 text-white hover:bg-blue-900" disabled={!canCheckout} onClick={() => {setError("");setReview(true)}}>{quoting ? "Checking delivery..." : "Review checkout"}<ArrowRight size={16} /></Button><p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck size={16} className="mt-0.5 shrink-0" />Prices, availability and discounts are checked again when you confirm payment.</p><div className="flex gap-4 text-xs text-blue-800 dark:text-blue-300"><Link href="/terms" className="underline">Terms of service</Link><Link href="/privacy" className="underline">Privacy policy</Link></div></div></Card></aside>
      </div>}
    </div>
    <Dialog open={review} onOpenChange={open => {if(!isSubmitting)setReview(open)}}><DialogContent aria-label="Review your checkout" className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><DialogTitle>Review your checkout</DialogTitle><DialogDescription>Confirm the contact details and payment arrangement before placing your order.</DialogDescription><div className="space-y-4 py-3"><div className="rounded-xl bg-muted/50 p-4 text-sm"><p className="font-medium">{shippingPhone}</p><p className="mt-2 break-words text-muted-foreground">{shippingAddress}</p>{notes && <p className="mt-2 break-words text-muted-foreground">{notes}</p>}</div><div className="flex justify-between gap-3 text-lg font-semibold"><span>{direct ? "Pay owners directly" : "Pay from wallet"}</span><span>{formatMoney(total)}</span></div><p className="text-sm text-muted-foreground">{cart.length} line(s). {direct ? "No wallet charge or M-Pesa prompt will be made. Contact each owner to arrange payment and fulfilment." : `Your remaining wallet balance will be approximately ${formatMoney(walletBalance - total)}.`} The final amount is verified by the server.</p>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}</div><Button disabled={!canCheckout} onClick={pay} className="min-h-12 bg-blue-800 text-white hover:bg-blue-900">{isSubmitting ? <><Loader2 size={16} className="animate-spin" />{direct ? "Placing order" : "Confirming payment"}…</> : direct ? "Place order - pay owner directly" : `Confirm & pay ${formatMoney(total)}`}</Button><Button variant="outline" disabled={isSubmitting} onClick={() => setReview(false)}>Back to edit</Button></DialogContent></Dialog>
  </div>
}
