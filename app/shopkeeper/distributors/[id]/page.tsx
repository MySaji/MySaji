"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { ArrowLeft, Truck, Star, Loader2, Package, MapPin, ShoppingCart, CheckCircle2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getDistributorProductsForBuyer, placeWholesaleOrder, type BuyerDistributorDetail } from "@/lib/actions/wholesale-orders"
import { getMyProducts, type ShopkeeperProduct } from "@/lib/actions/shopkeeper-products"
import { useLocalization } from "@/lib/hooks/useLocalization"

type OrderLine = { quantity: number; restockProductId: string }

export default function ShopkeeperDistributorDetailPage() {
  const { t, tn, formatMoney } = useLocalization()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [distributor, setDistributor] = useState<BuyerDistributorDetail>(null)
  const [myProducts, setMyProducts] = useState<ShopkeeperProduct[]>([])
  const [orderLines, setOrderLines] = useState<Record<string, OrderLine>>({})
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [isPlacing, setIsPlacing] = useState(false)
  const [placeError, setPlaceError] = useState("")
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getDistributorProductsForBuyer(params.id), getMyProducts()]).then(([dist, products]) => {
      setDistributor(dist)
      setMyProducts(products)
      if (dist && dist.locations.length > 0) setLocationId(dist.locations[0].id)
    }).finally(() => setIsLoading(false))
  }, [params.id])

  const setQuantity = (productId: string, quantity: number) => {
    setOrderLines((prev) => {
      if (quantity <= 0) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      return { ...prev, [productId]: { quantity, restockProductId: prev[productId]?.restockProductId ?? "" } }
    })
  }

  const setRestockLink = (productId: string, restockProductId: string) => {
    setOrderLines((prev) => ({ ...prev, [productId]: { quantity: prev[productId]?.quantity ?? 0, restockProductId } }))
  }

  const orderSummary = useMemo(() => {
    if (!distributor) return { lines: [], subtotal: 0 }
    const lines = Object.entries(orderLines).filter(([, line]) => line.quantity > 0).map(([productId, line]) => {
      const product = distributor.products.find((p) => p.id === productId)!
      const unitPrice = line.quantity >= product.minWholesaleQty ? product.wholesalePrice : product.retailPrice
      const tier = line.quantity >= product.minWholesaleQty ? "wholesale" : "retail"
      return { productId, name: product.name, quantity: line.quantity, unitPrice, tier, totalPrice: unitPrice * line.quantity }
    })
    const subtotal = lines.reduce((sum, l) => sum + l.totalPrice, 0)
    return { lines, subtotal }
  }, [orderLines, distributor])

  const deliveryFee = distributor?.locations.find((l) => l.id === locationId)?.deliveryFee ?? 500
  const grandTotal = orderSummary.subtotal + (orderSummary.lines.length > 0 ? deliveryFee : 0)

  const handlePlaceOrder = async () => {
    if (!distributor || orderSummary.lines.length === 0 || !locationId) return
    setIsPlacing(true)
    setPlaceError("")
    const result = await placeWholesaleOrder({
      distributorId: distributor.id,
      locationId,
      items: Object.entries(orderLines).filter(([, line]) => line.quantity > 0).map(([productId, line]) => ({
        distributorProductId: productId,
        quantity: line.quantity,
        restockProductId: line.restockProductId || undefined,
      })),
      notes: notes || undefined,
    })
    setIsPlacing(false)
    if (!result.success) { setPlaceError(result.error); return }
    const order = await import("@/lib/actions/wholesale-orders").then((m) => m.getMyWholesaleOrders())
    setPlacedOrderNumber(order.find((o) => o.id === result.orderId)?.orderNumber ?? "placed")
    setOrderLines({})
    setNotes("")
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!distributor) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">{t("shopkeeper.distributorDetail.distributorNotFound")}</p>
        <Button variant="outline" onClick={() => router.push("/shopkeeper/distributors")}>{t("shopkeeper.distributorDetail.backToDistributors")}</Button>
      </div>
    )
  }

  if (placedOrderNumber) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h1 className="text-lg font-bold text-foreground">{t("shopkeeper.distributorDetail.orderPlacedTitle")}</h1>
        <p className="text-muted-foreground">{t("shopkeeper.distributorDetail.orderPlacedHint", { orderNumber: placedOrderNumber, companyName: distributor.companyName })}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setPlacedOrderNumber(null)}>{t("shopkeeper.distributorDetail.orderMore")}</Button>
          <Button onClick={() => router.push("/shopkeeper/wholesale-orders")} className="bg-teal-600 hover:bg-teal-700">{t("shopkeeper.distributorDetail.viewMyOrders")}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 pb-32">
      <button onClick={() => router.push("/shopkeeper/distributors")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> {t("shopkeeper.distributorDetail.backToDistributors")}
      </button>

      <Card className="p-6 border-0 shadow-lg mb-6">
        <div className="flex items-start gap-4">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-teal-500 to-cyan-700 flex items-center justify-center flex-shrink-0">
            {distributor.logoUrl ? <Image src={distributor.logoUrl} alt={distributor.companyName} fill className="object-cover" /> : <Truck className="w-8 h-8 text-white/70" />}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{distributor.companyName}</h1>
            {distributor.reviewCount > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={`w-4 h-4 ${i < Math.round(distributor.rating) ? "fill-amber-400 text-amber-400" : "text-muted"}`} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{distributor.rating.toFixed(1)} {t("shopkeeper.endorsements.reviewsCount", { count: distributor.reviewCount })}</span>
              </div>
            )}
            {distributor.description && <p className="text-xs text-muted-foreground mt-2">{distributor.description}</p>}
            {distributor.locations.length > 1 ? (
              <div className="mt-3">
                <label className="text-[11px] text-muted-foreground mb-1 block">{t("shopkeeper.distributorDetail.fulfillmentLocationLabel")}</label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder={t("shopkeeper.distributorDetail.selectLocationPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {distributor.locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>{loc.name}{loc.city ? `, ${loc.city}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : distributor.locations.length === 1 ? (
              <div className="flex items-center gap-1 mt-3 text-[11px] bg-muted px-2 py-1 rounded-full text-muted-foreground w-fit">
                <MapPin className="w-3 h-3" /> {distributor.locations[0].name}
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      <h2 className="text-base font-bold text-foreground mb-4">{t("shopkeeper.distributorDetail.catalogTitle")}</h2>
      {distributor.products.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">{t("shopkeeper.distributorDetail.noProductsListedYet")}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {distributor.products.map((p) => {
            const line = orderLines[p.id]
            const activeTier = line && line.quantity >= p.minWholesaleQty ? "wholesale" : "retail"
            return (
              <Card key={p.id} className="overflow-hidden border-0 shadow-lg">
                <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
                  <Image src={p.images[0] || "/placeholder.svg"} alt={p.name} fill className="object-cover" />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-foreground line-clamp-2">{p.name}</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">{p.categoryName ?? t("shopkeeper.distributorDetail.uncategorized")} · SKU {p.sku}</p>

                  <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                    <div className={`rounded-lg p-2 ${activeTier === "retail" ? "bg-gray-100 dark:bg-gray-700 ring-1 ring-gray-300 dark:ring-gray-600" : "bg-gray-50 dark:bg-gray-800"}`}>
                      <p className="text-[10px] text-muted-foreground">{t("shopkeeper.distributorDetail.retailBelowMoq")}</p>
                      <p className="font-bold text-foreground">{formatMoney(p.retailPrice)}</p>
                    </div>
                    <div className={`rounded-lg p-2 ${activeTier === "wholesale" ? "bg-teal-100 dark:bg-teal-900/40 ring-1 ring-teal-400" : "bg-teal-50 dark:bg-teal-900/20"}`}>
                      <p className="text-[10px] text-teal-600 dark:text-teal-400">{t("shopkeeper.distributorDetail.wholesaleAtAboveMoq")}</p>
                      <p className="font-bold text-teal-700 dark:text-teal-400">{formatMoney(p.wholesalePrice)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-3">
                    <span>{t("shopkeeper.distributorDetail.moqLabel", { qty: p.minWholesaleQty })}{p.unit ? ` ${p.unit}` : ""}</span>
                    <span className={p.totalAvailableStock > 0 ? "text-emerald-600" : "text-red-600"}>
                      {p.totalAvailableStock > 0 ? t("shopkeeper.distributorDetail.inStock", { count: p.totalAvailableStock }) : t("shopkeeper.distributorDetail.outOfStock")}
                    </span>
                  </div>

                  {myProducts.length > 0 && (
                    <select
                      value={line?.restockProductId ?? ""}
                      onChange={(e) => setRestockLink(p.id, e.target.value)}
                      className="w-full mb-2 text-[11px] rounded-md border border-input bg-background px-2 py-1.5"
                    >
                      <option value="">{t("shopkeeper.distributorDetail.dontAutoRestock")}</option>
                      {myProducts.map((mp) => (
                        <option key={mp.id} value={mp.id}>{t("shopkeeper.distributorDetail.restockLabel", { name: mp.name })}</option>
                      ))}
                    </select>
                  )}

                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={p.totalAvailableStock}
                      placeholder={t("shopkeeper.distributorDetail.qtyPlaceholder")}
                      value={line?.quantity ?? ""}
                      onChange={(e) => setQuantity(p.id, parseInt(e.target.value, 10) || 0)}
                      className="flex-1"
                      disabled={p.totalAvailableStock === 0}
                    />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {orderSummary.lines.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-2xl z-50 pr-20 lg:pr-24">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="w-4 h-4 text-teal-600" />
              <span className="font-semibold text-xs text-foreground">{tn("shopkeeper.distributorDetail.itemCount", orderSummary.lines.length)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("shopkeeper.distributorDetail.orderNotesPlaceholder")} className="flex-1" />
              <div className="text-xs text-muted-foreground">
                {t("shopkeeper.distributorDetail.subtotalSummary", { subtotal: formatMoney(orderSummary.subtotal), deliveryFee: formatMoney(deliveryFee), grandTotal: formatMoney(grandTotal) })}
              </div>
              <Button onClick={handlePlaceOrder} disabled={isPlacing || !locationId} className="bg-teal-600 hover:bg-teal-700 whitespace-nowrap">
                {isPlacing ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.distributorDetail.placeOrder")}
              </Button>
            </div>
            {placeError && <p className="text-xs text-red-600 mt-2">{placeError}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
