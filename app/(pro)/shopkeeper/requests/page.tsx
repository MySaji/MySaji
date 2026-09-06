"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MapPin, MessageSquare, Loader2, CheckCircle2, ClipboardList } from "lucide-react"
import { getOpenRequestsBoard, respondToRequest, type BoardRequestItem } from "@/lib/actions/requests"
import { getMyProducts, type ShopkeeperProduct } from "@/lib/actions/shopkeeper-products"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ShopkeeperRequestsPage() {
  const { t, formatMoney } = useLocalization()
  const [requests, setRequests] = useState<BoardRequestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [activeRequest, setActiveRequest] = useState<BoardRequestItem | null>(null)
  const [message, setMessage] = useState("")
  const [price, setPrice] = useState("")
  // Accepting this response creates a real order, and an order line needs a
  // real catalogue item — so the shop names it here, where they know what
  // they are selling, rather than it being guessed at acceptance.
  const [products, setProducts] = useState<ShopkeeperProduct[]>([])
  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = () => getOpenRequestsBoard().then(setRequests)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    getMyProducts()
      .then((rows) => setProducts(rows.filter((r) => r.status !== "draft")))
      .catch(() => {})
  }, [])

  const openRespond = (req: BoardRequestItem) => {
    setActiveRequest(req)
    setMessage("")
    setPrice("")
    setProductId("")
    setQuantity("1")
    setFormError("")
  }

  const handleSubmit = async () => {
    if (!activeRequest) return
    setIsSubmitting(true)
    setFormError("")
    const result = await respondToRequest({
      requestId: activeRequest.id,
      message,
      price: Number(price),
      productId,
      quantity: Number(quantity) || 1,
    })
    setIsSubmitting(false)
    if (!result.success) { setFormError(result.error); return }
    setActiveRequest(null)
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("shopkeeper.requests.title")}</h1>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t("shopkeeper.requests.subtitle")}</p>
        </div>

        {requests.length === 0 ? (
          <Card className="p-10 text-center border-0 shadow-sm">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t("shopkeeper.requests.noOpenRequests")}</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <Card key={req.id} className="p-4 border-0 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-gray-900 dark:text-white">{req.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{req.categoryName}</p>
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{req.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{t("shopkeeper.requests.responseCount", { count: req.responseCount })}</span>
                      {(req.budgetMin != null || req.budgetMax != null) && (
                        <span>{req.budgetMin != null ? formatMoney(req.budgetMin) : "?"} – {req.budgetMax != null ? formatMoney(req.budgetMax) : "?"}</span>
                      )}
                    </div>
                  </div>
                  {req.myResponse ? (
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-primary">{formatMoney(req.myResponse.price)}</p>
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 mt-1"><CheckCircle2 className="w-3 h-3" />{t("shopkeeper.requests.responded")}</span>
                    </div>
                  ) : (
                    <Button size="sm" className="rounded-lg flex-shrink-0" onClick={() => openRespond(req)}>
                      {t("shopkeeper.requests.respondButton")}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={activeRequest !== null} onOpenChange={(open) => !open && setActiveRequest(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>{t("shopkeeper.requests.respondModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("shopkeeper.requests.messageLabel")}</label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t("shopkeeper.requests.messagePlaceholder")} className="min-h-[80px]" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("shopkeeper.requests.priceLabel")}</label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] text-gray-500 dark:text-gray-400">{t("shopkeeper.requests.productLabel")}</p>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={t("shopkeeper.requests.productPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {products.map((prod) => (
                    <SelectItem key={prod.id} value={prod.id}>
                      {prod.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {products.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">{t("shopkeeper.requests.noProducts")}</p>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[11px] text-gray-500 dark:text-gray-400">{t("shopkeeper.requests.quantityLabel")}</p>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            {formError && <p className="text-[11px] text-red-600">{formError}</p>}
            <Button className="w-full rounded-xl" onClick={handleSubmit} disabled={isSubmitting || message.trim().length < 5 || !(Number(price) > 0) || !productId}>
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.requests.submitResponse")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
