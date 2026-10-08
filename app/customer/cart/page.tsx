"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ShoppingCart, Trash2, Plus, Minus, Wallet, ArrowRight, MapPin, Loader2, Clock, Tag, X, Wrench, CalendarClock, Crown } from "lucide-react"
import { getCart, updateCartItemQuantity, removeCartItem, removeServiceCartItem, updateOfferCartItemQuantity, removeOfferCartItem, checkout, type CartLine } from "@/lib/actions/cart"
import { revalidateCartCount } from "@/lib/hooks/useCartCount"
import { useGatedAction } from "@/lib/hooks/useGatedAction"
import { getWalletSummary } from "@/lib/actions/wallet"
import { validatePromoCode } from "@/lib/actions/promo"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { AddressAutocompleteInput, type PlaceResult } from "@/components/maps/address-autocomplete-input"

export default function CustomerCartPage() {
  const { t, formatMoney } = useLocalization()
  const { handleGateFailure } = useGatedAction()
  const [cart, setCart] = useState<CartLine[]>([])
  const [walletBalance, setWalletBalance] = useState(0)
  const [shippingAddress, setShippingAddress] = useState("")
  // Only set when the address was picked from autocomplete. Without it the
  // order still goes through, it just can't be distance-checked against a
  // shop's delivery radius — see lib/delivery-zone.ts.
  const [shippingCoords, setShippingCoords] = useState<{ latitude: number; longitude: number } | null>(null)
  const [shippingPhone, setShippingPhone] = useState("")
  const [notes, setNotes] = useState("")
  const [checkoutState, setCheckoutState] = useState<"idle" | "ordered">("idle")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState("")

  const [promoCode, setPromoCode] = useState("")
  const [appliedPromo, setAppliedPromo] = useState<{ shopName: string; discountAmount: number } | null>(null)
  const [promoError, setPromoError] = useState("")
  const [isApplyingPromo, setIsApplyingPromo] = useState(false)

  const refresh = async () => {
    const [nextCart, wallet] = await Promise.all([getCart(), getWalletSummary()])
    setCart(nextCart)
    setWalletBalance(wallet?.balance ?? 0)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const productLines = useMemo(() => cart.filter((item) => item.kind === "product"), [cart])
  const serviceLines = useMemo(() => cart.filter((item) => item.kind === "service"), [cart])
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart])
  const shipping = useMemo(() => {
    if (productLines.length === 0) return 0
    const feeByShop = new Map<string, number>()
    for (const item of productLines) feeByShop.set(item.shop, item.shopDeliveryFee)
    return [...feeByShop.values()].reduce((sum, fee) => sum + fee, 0)
  }, [productLines])
  const closedShops = useMemo(() => {
    const seen = new Map<string, string | null>()
    for (const item of productLines) {
      if (!item.shopIsOpen && !item.shopIsOnVacation && !seen.has(item.shop)) seen.set(item.shop, item.shopNextOpeningLabel)
    }
    return [...seen.entries()]
  }, [productLines])
  const vacationingShops = useMemo(() => {
    const seen = new Map<string, string | null>()
    for (const item of productLines) {
      if (item.shopIsOnVacation && !seen.has(item.shop)) seen.set(item.shop, item.shopVacationNote)
    }
    return [...seen.entries()]
  }, [productLines])
  const discount = appliedPromo?.discountAmount ?? 0
  const total = subtotal + shipping - discount
  const canPay = walletBalance >= total
  const canCheckout = canPay && vacationingShops.length === 0

  const updateOfferQuantity = async (cartItemId: string, quantity: number) => {
    await updateOfferCartItemQuantity({ cartItemId, quantity })
    setCart(await getCart())
    void revalidateCartCount()
  }

  const removeOffer = async (cartItemId: string) => {
    await removeOfferCartItem({ cartItemId })
    setCart(await getCart())
    void revalidateCartCount()
  }

  const updateQuantity = async (productId: string, quantity: number) => {
    await updateCartItemQuantity({ productId, quantity })
    setCart(await getCart())
    void revalidateCartCount()
  }

  const removeItem = async (productId: string) => {
    await removeCartItem({ productId })
    setCart(await getCart())
    void revalidateCartCount()
  }

  const removeService = async (cartItemId: string) => {
    await removeServiceCartItem({ cartItemId })
    setCart(await getCart())
    void revalidateCartCount()
  }

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return
    setIsApplyingPromo(true)
    setPromoError("")
    const result = await validatePromoCode(promoCode)
    setIsApplyingPromo(false)
    if (!result.success) { setAppliedPromo(null); setPromoError(result.error); return }
    setAppliedPromo({ shopName: result.shopName, discountAmount: result.discountAmount })
  }

  const handleRemovePromo = () => {
    setAppliedPromo(null)
    setPromoCode("")
    setPromoError("")
  }

  const handleCheckout = async () => {
    if (!canCheckout || cart.length === 0 || !shippingAddress || !shippingPhone) return
    setIsSubmitting(true)
    setCheckoutError("")
    const result = await checkout({
      shippingAddress, shippingPhone, notes,
      promoCode: appliedPromo ? promoCode : undefined,
      ...(shippingCoords ?? {}),
    })
    setIsSubmitting(false)
    // A verification refusal opens the wizard instead of leaving the
    // shopper staring at a message with nowhere to act on it.
    if (!result.success) {
      if (handleGateFailure(result)) return
      setCheckoutError(result.error)
      return
    }
    await refresh()
    void revalidateCartCount()
    setCheckoutState("ordered")
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 5xl, not 7xl: a two-column cart stretched across 1280px left the
          item rows enormous and the eye travelling a long way between a
          product and its price. */}
      <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{t("customer.cart.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("customer.cart.subtitle")}</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <Wallet className="h-4 w-4" />
            {t("customer.cart.walletLabel")}: {formatMoney(walletBalance)}
          </div>
        </div>

        {checkoutState === "ordered" ? (
          <Card className="border-emerald-200 bg-emerald-50 p-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-400">
            <h2 className="text-lg font-semibold">{t("customer.cart.orderPlacedTitle")}</h2>
            <p className="mt-2 text-xs">{t("customer.cart.orderPlacedBody", { amount: formatMoney(total) })}</p>
            <Link href="/customer/services" className="mt-4 inline-flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
              {t("customer.cart.continueShopping")} <ArrowRight className="h-4 w-4" />
            </Link>
          </Card>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4">
              {vacationingShops.length > 0 && (
                <div className="space-y-2">
                  {vacationingShops.map(([shopName, note]) => (
                    <div key={shopName} className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                      <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <p>
                        <strong>{shopName}</strong> {t("customer.cart.shopOnVacationNotice")}{note ? <> <strong>{note}</strong></> : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {closedShops.length > 0 && (
                <div className="space-y-2">
                  {closedShops.map(([shopName, nextOpening]) => (
                    <div key={shopName} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                      <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <p>
                        <strong>{shopName}</strong> {t("customer.cart.shopClosedNotice")}{nextOpening ? <> <strong>{nextOpening}</strong></> : ""}.
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {cart.length === 0 ? (
                <Card className="p-8 text-center">
                  <ShoppingCart className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h2 className="text-base font-semibold">{t("customer.cart.emptyTitle")}</h2>
                  <p className="mt-2 text-xs text-muted-foreground">{t("customer.cart.emptySubtitle")}</p>
                  <Link href="/customer/services" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-primary">
                    {t("customer.cart.browseProducts")} <ArrowRight className="h-4 w-4" />
                  </Link>
                </Card>
              ) : (
                cart.map((item) =>
                  item.kind === "offer" ? (
                    // A BUY offer is a provider's own product: same quantity
                    // stepper as a shop product, but it carries a provider
                    // rather than a shop, and no delivery fee of its own.
                    <Card key={item.cartItemId} className="overflow-hidden p-0">
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                        <div className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-amber-500/10 sm:h-24 sm:w-24">
                          {item.image ? <Image src={item.image} alt={item.name} fill className="object-cover" /> : <Crown className="h-8 w-8 text-amber-500" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                                <Crown className="h-3 w-3" /> {t("customer.cart.proOfferBadge")}
                              </span>
                              <h3 className="mt-1 font-semibold text-foreground">{item.name}</h3>
                              <p className="text-xs text-muted-foreground">{item.providerName}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeOffer(item.cartItemId)} aria-label={t("common.removeItem")}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="inline-flex items-center rounded-full border border-border bg-muted/60 p-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateOfferQuantity(item.cartItemId, item.quantity - 1)} aria-label={t("common.decreaseQuantity")}>
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="min-w-10 text-center text-xs font-medium">{item.quantity}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => updateOfferQuantity(item.cartItemId, item.quantity + 1)}
                                disabled={item.stock != null && item.quantity >= item.stock}
                                aria-label={t("common.increaseQuantity")}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">{formatMoney(item.price * item.quantity)}</p>
                              <p className="text-[11px] text-muted-foreground">{t("customer.cart.priceEach", { amount: formatMoney(item.price) })}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ) : item.kind === "product" ? (
                    <Card key={item.productId} className="overflow-hidden p-0">
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                        <div className="relative h-24 w-full overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
                          <Image src={item.image || "/placeholder.svg"} alt={item.name} fill className="object-cover" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="font-semibold text-foreground">{item.name}</h3>
                              <p className="text-xs text-muted-foreground">{item.shop}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(item.productId)} aria-label={t("common.removeItem")}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="inline-flex items-center rounded-full border border-border bg-muted/60 p-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.productId, item.quantity - 1)} aria-label={t("common.decreaseQuantity")}>
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="min-w-10 text-center text-xs font-medium">{item.quantity}</span>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => updateQuantity(item.productId, item.quantity + 1)} disabled={item.quantity >= item.stock} aria-label={t("common.increaseQuantity")}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">{formatMoney(item.price * item.quantity)}</p>
                              <p className="text-[11px] text-muted-foreground">{t("customer.cart.priceEach", { amount: formatMoney(item.price) })}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <Card key={item.cartItemId} className="overflow-hidden p-0">
                      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                        <div className="relative flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-primary/10 sm:h-24 sm:w-24">
                          {item.image ? <Image src={item.image} alt={item.name} fill className="object-cover" /> : <Wrench className="h-8 w-8 text-primary" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                <Wrench className="h-3 w-3" /> {t("customer.cart.serviceBadge")}
                              </span>
                              <h3 className="mt-1 font-semibold text-foreground">{item.name}</h3>
                              <p className="text-xs text-muted-foreground">{item.providerName}</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeService(item.cartItemId)} aria-label={t("common.removeItem")}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <CalendarClock className="h-3.5 w-3.5" />
                              {t("customer.cart.scheduledFor", { date: new Date(item.scheduledDate).toLocaleString() })}
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">{formatMoney(item.price * item.quantity)}</p>
                              {item.quantity > 1 && <p className="text-[11px] text-muted-foreground">{t("customer.cart.priceEach", { amount: formatMoney(item.price) })}</p>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )
                )
              )}
            </div>

            {/* Sticky on desktop so the total and the pay button stay reachable
                while a long cart scrolls — the standard checkout pattern. */}
            <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <Card className="p-5">
                <h2 className="text-base font-semibold">{t("customer.cart.shippingDetails")}</h2>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {t("customer.cart.deliveryNotice")}
                  </div>
                  <Input placeholder={t("customer.cart.phonePlaceholder")} value={shippingPhone} onChange={(e) => setShippingPhone(e.target.value)} />
                  <AddressAutocompleteInput
                    value={shippingAddress}
                    onChange={(value) => {
                      setShippingAddress(value)
                      // Typing by hand invalidates the pin: the text and the
                      // coordinates must describe the same place, and there
                      // is no geocoder here to re-derive one from the other.
                      setShippingCoords(null)
                    }}
                    onPlaceSelected={(place: PlaceResult) => {
                      setShippingAddress(place.address)
                      setShippingCoords({ latitude: place.latitude, longitude: place.longitude })
                    }}
                    placeholder={t("customer.cart.addressPlaceholder")}
                  />
                  <Textarea placeholder={t("customer.cart.notesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="text-base font-semibold">{t("customer.cart.orderSummary")}</h2>

                <div className="mt-4">
                  {appliedPromo ? (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs">
                      <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                        <Tag className="h-3.5 w-3.5" />
                        {t("customer.cart.promoApplied", { shop: appliedPromo.shopName })}
                      </span>
                      <button onClick={handleRemovePromo} aria-label={t("common.removeItem")} className="text-emerald-700 dark:text-emerald-400 hover:opacity-70">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input placeholder={t("customer.cart.promoCodePlaceholder")} value={promoCode} onChange={(e) => { setPromoCode(e.target.value); setPromoError("") }} />
                      <Button type="button" variant="outline" onClick={handleApplyPromo} disabled={!promoCode.trim() || isApplyingPromo}>
                        {isApplyingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : t("customer.cart.applyPromo")}
                      </Button>
                    </div>
                  )}
                  {promoError && <p className="mt-1.5 text-[11px] text-red-600">{promoError}</p>}
                </div>

                <div className="mt-4 space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.cart.subtotal")}</span><span>{formatMoney(subtotal)}</span></div>
                  {discount > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.orderDetail.discountLabel")}</span><span className="text-emerald-600">-{formatMoney(discount)}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.cart.shipping")}</span><span>{formatMoney(shipping)}</span></div>
                  <div className="flex justify-between border-t border-border pt-3 text-sm font-semibold">
                    <span>{t("payment.total")}</span>
                    <span>{formatMoney(total)}</span>
                  </div>
                </div>
                {!canPay && cart.length > 0 && (
                  <p className="mt-3 text-xs text-red-600">{t("customer.cart.insufficientBalance")}</p>
                )}
                {vacationingShops.length > 0 && (
                  <p className="mt-3 text-xs text-red-600">{t("customer.cart.vacationingShopsNotice")}</p>
                )}
                {checkoutError && <p className="mt-3 text-xs text-red-600">{checkoutError}</p>}
                <Button className="mt-4 w-full" onClick={handleCheckout} disabled={cart.length === 0 || !canCheckout || !shippingAddress || !shippingPhone || isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("customer.cart.payFromWallet")}
                </Button>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
