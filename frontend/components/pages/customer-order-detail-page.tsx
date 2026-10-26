"use client"

import { DirectPaymentNote } from "@/frontend/components/booking/direct-payment-note"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { Loader2, ArrowLeft, Package, Clock, Truck, CheckCircle2, XCircle, Camera, X as XIcon } from "lucide-react"
import { getCustomerOrderById, requestOrderReturn, cancelOrder, type CustomerOrderDetail } from "@/backend/actions/orders"
import { RETURN_REASONS, type ReturnReason } from "@/backend/domain/order-return-reasons"
import { CANCEL_REASONS, type CancelReason } from "@/backend/domain/order-cancel-reasons"
import { compressImageToDataUrl } from "@/frontend/lib/compress-image"

export function CustomerOrderDetailPage({ orderId }: { orderId: string }) {
  const router = useRouter()
  const { t, formatMoney } = useLocalization()
  const [order, setOrder] = useState<CustomerOrderDetail>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [reason, setReason] = useState<ReturnReason>("DAMAGED")
  const [description, setDescription] = useState("")
  const [photos, setPhotos] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState<CancelReason>("CHANGED_MIND")
  const [isCancelling, setIsCancelling] = useState(false)
  const [cancelError, setCancelError] = useState("")
  const [cancelSubmitted, setCancelSubmitted] = useState(false)

  const REASON_LABEL: Record<ReturnReason, string> = {
    DAMAGED: t("customer.orderDetail.reasonDamaged"),
    WRONG_ITEM: t("customer.orderDetail.reasonWrongItem"),
    NOT_AS_DESCRIBED: t("customer.orderDetail.reasonNotAsDescribed"),
    MISSING_ITEM: t("customer.orderDetail.reasonMissingItem"),
    OTHER: t("customer.orderDetail.reasonOther"),
  }

  const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
    CHANGED_MIND: t("customer.orderDetail.cancelReasonChangedMind"),
    ORDERED_BY_MISTAKE: t("customer.orderDetail.cancelReasonOrderedByMistake"),
    FOUND_CHEAPER: t("customer.orderDetail.cancelReasonFoundCheaper"),
    TAKING_TOO_LONG: t("customer.orderDetail.cancelReasonTakingTooLong"),
    OTHER: t("customer.orderDetail.reasonOther"),
  }

  const DISPUTE_STATUS_LABEL: Record<string, string> = {
    OPEN: t("customer.orderDetail.statusOpen"),
    IN_REVIEW: t("customer.orderDetail.statusInReview"),
    RESOLVED: t("customer.orderDetail.statusResolved"),
    ESCALATED: t("customer.orderDetail.statusEscalated"),
    CLOSED: t("customer.orderDetail.statusClosed"),
  }

  const refresh = () => getCustomerOrderById(orderId).then(setOrder)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const handleAddPhoto = async (file: File) => {
    const dataUrl = await compressImageToDataUrl(file)
    setPhotos((prev) => [...prev, dataUrl].slice(0, 4))
  }

  const openReturnModal = () => {
    setShowReturnModal(true)
    setSubmitted(false)
    setFormError("")
    setDescription("")
    setPhotos([])
    setReason("DAMAGED")
  }

  const handleSubmitReturn = async () => {
    if (!order) return
    setIsSubmitting(true)
    setFormError("")
    const result = await requestOrderReturn({ orderId: order.id, reason, description, photos })
    setIsSubmitting(false)
    if (!result.success) { setFormError(result.error); return }
    setSubmitted(true)
    await refresh()
  }

  const openCancelModal = () => {
    setShowCancelModal(true)
    setCancelSubmitted(false)
    setCancelError("")
    setCancelReason("CHANGED_MIND")
  }

  const handleSubmitCancel = async () => {
    if (!order) return
    setIsCancelling(true)
    setCancelError("")
    const result = await cancelOrder({ orderId: order.id, reason: cancelReason })
    setIsCancelling(false)
    if (!result.success) { setCancelError(result.error); return }
    setCancelSubmitted(true)
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-base font-semibold text-foreground">{t("customer.orderDetail.notFound")}</p>
        <Link href="/customer/orders" className="text-xs font-medium text-primary hover:underline">{t("customer.orderDetail.backToOrders")}</Link>
      </div>
    )
  }

  const steps = [
    { key: "PLACED", label: t("customer.orderDetail.orderPlaced"), at: order.createdAt as string | null, icon: Package },
    { key: "PROCESSING", label: t("customer.orderDetail.processing"), at: order.processingAt, icon: Clock },
    { key: "SHIPPED", label: t("customer.orderDetail.shipped"), at: order.shippedAt, icon: Truck },
    { key: "DELIVERED", label: t("customer.orderDetail.delivered"), at: order.deliveredAt, icon: CheckCircle2 },
  ]

  const isCancelled = order.status === "CANCELLED"
  const canRequestReturn = order.status === "DELIVERED" && !order.existingDispute

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6 lg:py-8">
        <button onClick={() => router.push("/customer/orders")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> {t("customer.orderDetail.backToOrders")}
        </button>

        <div className="mb-6">
          <h1 className="text-lg lg:text-xl font-bold text-foreground">#{order.orderNumber}</h1>
          <p className="text-xs text-muted-foreground mt-1">{t("customer.orderDetail.shopLabel", { shop: order.shopName })}</p>
        </div>

        {/* Timeline */}
        {order.directPayment && <DirectPaymentNote />}
        <Card className="p-5 border-0 shadow-sm rounded-2xl mb-4">
          <h2 className="text-xs font-bold text-foreground mb-4">{t("customer.orderDetail.timelineTitle")}</h2>
          {isCancelled ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{t("customer.orderDetail.cancelled")}</p>
                {order.cancelledAt && <p className="text-[11px] text-muted-foreground">{new Date(order.cancelledAt).toLocaleString()}</p>}
              </div>
            </div>
          ) : (
            <div>
              {steps.map((step, i) => {
                const Icon = step.icon
                const reached = Boolean(step.at)
                const isLast = i === steps.length - 1
                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${reached ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      {!isLast && <div className={`w-0.5 flex-1 min-h-6 ${reached ? "bg-primary" : "bg-border"}`} />}
                    </div>
                    <div className={isLast ? "pb-0" : "pb-6"}>
                      <p className={`text-xs font-semibold ${reached ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>
                      <p className="text-[11px] text-muted-foreground">{step.at ? new Date(step.at).toLocaleString() : "—"}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Items */}
        <Card className="p-5 border-0 shadow-sm rounded-2xl mb-4">
          <h2 className="text-xs font-bold text-foreground mb-3">{t("customer.orderDetail.itemsTitle")}</h2>
          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="relative w-12 h-12 rounded-lg bg-muted/30 overflow-hidden flex-shrink-0">
                  <Image src={item.image || "/placeholder.svg"} alt={item.name} fill className="object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                  <p className="text-[11px] text-muted-foreground">x{item.quantity}</p>
                </div>
                <p className="text-xs font-semibold text-foreground flex-shrink-0">{formatMoney(item.totalPrice)}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Summary */}
        <Card className="p-5 border-0 shadow-sm rounded-2xl mb-4">
          <h2 className="text-xs font-bold text-foreground mb-3">{t("customer.orderDetail.summaryTitle")}</h2>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.orderDetail.subtotalLabel")}</span><span className="text-foreground">{formatMoney(order.subtotal)}</span></div>
            {order.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.orderDetail.discountLabel")}</span><span className="text-emerald-600">-{formatMoney(order.discount)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.orderDetail.shippingLabel")}</span><span className="text-foreground">{formatMoney(order.shippingCost)}</span></div>
            {order.tax > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t("customer.orderDetail.taxLabel")}</span><span className="text-foreground">{formatMoney(order.tax)}</span></div>}
            <div className="flex justify-between pt-1.5 mt-1.5 border-t border-border font-bold"><span className="text-foreground">{t("customer.orderDetail.totalLabel")}</span><span className="text-primary">{formatMoney(order.total)}</span></div>
          </div>
          {order.addressLabel && (
            <div className="mt-3 pt-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground">{t("customer.orderDetail.deliveryAddressLabel")}</p>
              <p className="text-xs text-foreground mt-0.5">{order.addressLabel}</p>
            </div>
          )}
        </Card>

        {/* Existing dispute / return request */}
        {order.existingDispute && (
          <Card className="p-5 border-0 shadow-sm rounded-2xl mb-4 bg-amber-50 dark:bg-amber-900/20">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">{t("customer.orderDetail.existingRequestLabel")} #{order.existingDispute.disputeNumber}</p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">{order.existingDispute.reason} &middot; {DISPUTE_STATUS_LABEL[order.existingDispute.status] ?? order.existingDispute.status}</p>
            {order.existingDispute.resolution && <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">{order.existingDispute.resolution}</p>}
          </Card>
        )}

        <div className="space-y-2">
          {order.canCancel && (
            <Button variant="outline" className="w-full rounded-xl bg-transparent text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/10" onClick={openCancelModal}>
              {t("customer.orderDetail.cancelOrder")}
            </Button>
          )}
          {canRequestReturn && (
            <Button variant="outline" className="w-full rounded-xl bg-transparent" onClick={openReturnModal}>
              {t("customer.orderDetail.requestReturn")}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={showReturnModal} onOpenChange={setShowReturnModal}>
        <DialogContent className="max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("customer.orderDetail.returnModalTitle")}</DialogTitle></DialogHeader>
          {submitted ? (
            <p className="text-xs text-emerald-600 py-4">{t("customer.orderDetail.returnSubmitted")}</p>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium mb-2 block">{t("customer.orderDetail.reasonLabel")}</label>
                <div className="space-y-1.5">
                  {RETURN_REASONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="radio" name="return-reason" checked={reason === r} onChange={() => setReason(r)} className="accent-primary" />
                      {REASON_LABEL[r]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-2 block">{t("customer.orderDetail.descriptionLabel")}</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("customer.orderDetail.descriptionPlaceholder")} className="min-h-[80px]" />
              </div>
              <div>
                <label className="text-xs font-medium mb-2 block">{t("customer.orderDetail.photosLabel")}</label>
                <div className="flex gap-2 flex-wrap">
                  {photos.map((p, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                      {/* Images use the configured unoptimized rendering policy -- base64 data URL preview */}
                      <img src={p} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center"
                        aria-label={t("common.delete")}
                      >
                        <XIcon className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                  {photos.length < 4 && (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors">
                      <Camera className="w-5 h-5 text-muted-foreground" />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        aria-label={t("customer.orderDetail.addPhoto")}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleAddPhoto(f); e.target.value = "" }}
                      />
                    </label>
                  )}
                </div>
              </div>
              {formError && <p className="text-[11px] text-red-600">{formError}</p>}
              <Button className="w-full rounded-xl" onClick={handleSubmitReturn} disabled={description.trim().length < 10 || isSubmitting}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.orderDetail.submitReturn")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader><DialogTitle>{t("customer.orderDetail.cancelModalTitle")}</DialogTitle></DialogHeader>
          {cancelSubmitted ? (
            <p className="text-xs text-emerald-600 py-4">{order.directPayment ? "Your order was cancelled. Arrange any refund directly with the owner; no wallet credit was issued." : t("customer.orderDetail.cancelSubmitted")}</p>
          ) : (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium mb-2 block">{t("customer.orderDetail.reasonLabel")}</label>
                <div className="space-y-1.5">
                  {CANCEL_REASONS.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="radio" name="cancel-reason" checked={cancelReason === r} onChange={() => setCancelReason(r)} className="accent-primary" />
                      {CANCEL_REASON_LABEL[r]}
                    </label>
                  ))}
                </div>
              </div>
              {cancelError && <p className="text-[11px] text-red-600">{cancelError}</p>}
              <Button className="w-full rounded-xl bg-red-600 hover:bg-red-700" onClick={handleSubmitCancel} disabled={isCancelling}>
                {isCancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.orderDetail.submitCancel")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
