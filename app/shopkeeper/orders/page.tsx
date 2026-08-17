"use client"

import { useEffect, useState } from "react"
import {
  Search, Package, Truck, CheckCircle2, Clock, XCircle,
  Phone, MapPin, Calendar, MoreVertical, Eye, Printer,
  TrendingUp, DollarSign, Loader2, RotateCcw, Undo2, Check, X as XIcon,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { KycDocumentViewer, type KycDocumentItem } from "@/components/kyc/kyc-document-viewer"
import Image from "next/image"
import {
  getMyOrders, advanceOrderStatus, cancelMyOrder,
  getShopOrderDisputes, acceptShopReturnRequest, rejectShopReturnRequest,
  type ShopkeeperOrder, type ShopkeeperOrderStatus, type ShopOrderDispute,
} from "@/lib/actions/shopkeeper-orders"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ShopkeeperOrdersPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<ShopkeeperOrder | null>(null)
  const [ordersList, setOrdersList] = useState<ShopkeeperOrder[]>([])
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [returnRequests, setReturnRequests] = useState<ShopOrderDispute[]>([])
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState("")
  const [declineError, setDeclineError] = useState("")

  const refresh = async () => {
    const [orders, returns] = await Promise.all([getMyOrders(), getShopOrderDisputes()])
    setOrdersList(orders)
    setReturnRequests(returns)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const tabs: { key: string; label: string; icon: typeof Package }[] = [
    { key: "all", label: t("shopkeeper.orders.tabAllOrders"), icon: Package },
    { key: "pending", label: t("shopkeeper.orders.statPending"), icon: Clock },
    { key: "processing", label: t("shopkeeper.orders.tabProcessing"), icon: TrendingUp },
    { key: "shipped", label: t("shopkeeper.orders.tabShipped"), icon: Truck },
    { key: "delivered", label: t("shopkeeper.orders.tabDelivered"), icon: CheckCircle2 },
    { key: "cancelled", label: t("shopkeeper.orders.tabCancelled"), icon: XCircle },
    { key: "returns", label: t("shopkeeper.orders.tabReturns"), icon: Undo2 },
  ]

  const filteredOrders = ordersList.filter(order => {
    const matchesSearch =
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customerPhone ?? "").includes(searchQuery)
    const matchesTab = activeTab === "all" || order.status === activeTab
    return matchesSearch && matchesTab
  })

  const getStatusColor = (status: ShopkeeperOrderStatus) => {
    const colors: Record<ShopkeeperOrderStatus, string> = {
      pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-300",
      processing: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300",
      shipped: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-300",
      delivered: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300",
      cancelled: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300",
      refunded: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400 border-gray-300",
    }
    return colors[status] ?? colors.pending
  }

  const getStatusIcon = (status: ShopkeeperOrderStatus) => {
    const icons: Record<ShopkeeperOrderStatus, React.ReactNode> = {
      pending: <Clock className="w-4 h-4" />,
      processing: <TrendingUp className="w-4 h-4" />,
      shipped: <Truck className="w-4 h-4" />,
      delivered: <CheckCircle2 className="w-4 h-4" />,
      cancelled: <XCircle className="w-4 h-4" />,
      refunded: <RotateCcw className="w-4 h-4" />,
    }
    return icons[status]
  }

  const getStatusLabel = (status: ShopkeeperOrderStatus) => {
    const labels: Record<ShopkeeperOrderStatus, string> = {
      pending: t("shopkeeper.orders.statusPending"),
      processing: t("shopkeeper.orders.statusProcessing"),
      shipped: t("shopkeeper.orders.statusShipped"),
      delivered: t("shopkeeper.orders.statusDelivered"),
      cancelled: t("shopkeeper.orders.statusCancelled"),
      refunded: t("shopkeeper.orders.statusRefunded"),
    }
    return labels[status] ?? status
  }

  const handleAdvance = async (orderId: string, status: "processing" | "shipped" | "delivered") => {
    setBusyOrderId(orderId)
    const result = await advanceOrderStatus({ orderId, status })
    setBusyOrderId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleCancel = async (orderId: string) => {
    if (!confirm(t("shopkeeper.orders.cancelConfirm"))) return
    setBusyOrderId(orderId)
    const result = await cancelMyOrder({ orderId })
    setBusyOrderId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handlePrint = () => {
    window.print()
  }

  const handleAcceptReturn = async (disputeId: string) => {
    setBusyOrderId(disputeId)
    const result = await acceptShopReturnRequest({ disputeId })
    setBusyOrderId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const openDecline = (disputeId: string) => { setDecliningId(disputeId); setDeclineReason(""); setDeclineError("") }

  const submitDecline = async (disputeId: string) => {
    setBusyOrderId(disputeId)
    setDeclineError("")
    const result = await rejectShopReturnRequest({ disputeId, reason: declineReason.trim() })
    setBusyOrderId(null)
    if (!result.success) { setDeclineError(result.error); return }
    setDecliningId(null)
    await refresh()
  }

  const orderStats = [
    { label: t("shopkeeper.orders.statTotalOrders"), value: ordersList.length, icon: Package, color: "from-blue-500 to-blue-600" },
    { label: t("shopkeeper.orders.statPending"), value: ordersList.filter(o => o.status === "pending").length, icon: Clock, color: "from-yellow-500 to-yellow-600" },
    { label: t("shopkeeper.orders.statInTransit"), value: ordersList.filter(o => o.status === "shipped").length, icon: Truck, color: "from-purple-500 to-purple-600" },
    { label: t("shopkeeper.orders.statTotalRevenue"), value: formatMoney(ordersList.reduce((sum, o) => sum + o.amount, 0)), icon: DollarSign, color: "from-emerald-500 to-emerald-600" },
  ]

  const formatDate = (iso: string) => {
    const date = new Date(iso)
    const isToday = date.toDateString() === new Date().toDateString()
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    if (isToday) return t("shopkeeper.orders.todayAt", { time })
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-800 dark:to-orange-800 text-white p-4 sm:p-6 lg:rounded-b-3xl overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold mb-4 truncate">{t("shopkeeper.orders.title")}</h1>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
            {orderStats.map((stat, idx) => {
              const Icon = stat.icon
              return (
                <div key={idx} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 sm:p-4 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-amber-100 truncate">{stat.label}</p>
                      <p className="text-lg sm:text-2xl font-bold truncate">{stat.value}</p>
                    </div>
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-amber-200 opacity-60 flex-shrink-0" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 -mt-4 overflow-x-hidden">
        {/* Search */}
        <Card className="p-3 sm:p-4 mb-4 sm:mb-6 shadow-lg border-0">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("shopkeeper.orders.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const count = tab.key === "all"
              ? ordersList.length
              : tab.key === "returns"
                ? returnRequests.length
                : ordersList.filter(o => o.status === tab.key).length

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all font-medium ${
                  activeTab === tab.key
                    ? "bg-amber-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-amber-600"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === tab.key ? "bg-white/20" : "bg-gray-100 dark:bg-gray-700"
                }`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Return Requests */}
        {activeTab === "returns" && (
          <div className="space-y-3">
            {returnRequests.length === 0 ? (
              <div className="text-center py-12">
                <Undo2 className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-600 dark:text-gray-400">{t("shopkeeper.orders.noReturnsFound")}</p>
              </div>
            ) : (
              returnRequests.map((req) => {
                const isBusy = busyOrderId === req.id
                return (
                  <Card key={req.id} className="p-3 sm:p-4 border-0 shadow-sm overflow-hidden">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white truncate">{req.orderNumber}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{req.customerName}</p>
                      </div>
                      <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {req.status === "OPEN" ? t("shopkeeper.orders.returnStatusOpen") : t("shopkeeper.orders.returnStatusInReview")}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{req.reason}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 break-words">{req.description}</p>
                    {req.photos.length > 0 && (
                      <div className="mt-3">
                        <KycDocumentViewer documents={req.photos.map((url, i) => ({ label: `${t("customer.orderDetail.addPhoto")} ${i + 1}`, url })) satisfies KycDocumentItem[]} />
                      </div>
                    )}

                    {decliningId === req.id ? (
                      <div className="mt-3 space-y-2">
                        <Textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder={t("shopkeeper.orders.declineReasonPlaceholder")} className="min-h-[70px] text-sm" />
                        {declineError && <p className="text-xs text-red-600">{declineError}</p>}
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="bg-transparent" onClick={() => setDecliningId(null)} disabled={isBusy}>{t("common.cancel")}</Button>
                          <Button size="sm" variant="destructive" onClick={() => submitDecline(req.id)} disabled={declineReason.trim().length < 5 || isBusy}>
                            {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.orders.confirmDecline")}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <Button size="sm" variant="outline" className="flex-1 bg-transparent" onClick={() => openDecline(req.id)} disabled={isBusy}>
                          <XIcon className="w-4 h-4 mr-1" />{t("shopkeeper.orders.declineReturn")}
                        </Button>
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAcceptReturn(req.id)} disabled={isBusy}>
                          {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-1" />{t("shopkeeper.orders.acceptReturn")}</>}
                        </Button>
                      </div>
                    )}
                  </Card>
                )
              })
            )}
          </div>
        )}

        {/* Orders List */}
        {activeTab !== "returns" && (
        <div className="space-y-3">
          {filteredOrders.length > 0 ? (
            filteredOrders.map((order) => {
              const firstItem = order.items[0]
              const extraCount = order.items.length - 1
              const isFinal = order.status === "delivered" || order.status === "cancelled" || order.status === "refunded"
              const isBusy = busyOrderId === order.id

              return (
                <Card
                  key={order.id}
                  className="p-3 sm:p-4 hover:shadow-lg transition-all border-0 cursor-pointer overflow-hidden"
                  onClick={() => {
                    setSelectedOrder(order)
                    setShowOrderDetails(true)
                  }}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0 relative">
                      <Image
                        src={firstItem?.image || "/placeholder.svg"}
                        alt={firstItem?.productName ?? t("shopkeeper.orders.orderFallback")}
                        fill
                        className="object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white truncate">{order.orderNumber}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {firstItem?.productName ?? t("shopkeeper.orders.orderFallback")}{extraCount > 0 ? ` ${t("shopkeeper.orders.moreItemsSuffix", { count: extraCount })}` : ""}
                          </p>
                        </div>
                        <div className={`flex-shrink-0 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold flex items-center gap-1 border whitespace-nowrap ${getStatusColor(order.status)}`}>
                          {getStatusIcon(order.status)}
                          {getStatusLabel(order.status)}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1.5 sm:gap-4 text-xs sm:text-sm mb-3">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 min-w-0">
                          <Image
                            src={order.customerAvatar || "/placeholder.svg"}
                            alt={order.customerName}
                            width={24}
                            height={24}
                            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                          />
                          <span className="truncate">{order.customerName}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 min-w-0">
                          <Phone className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{order.customerPhone ?? t("shopkeeper.orders.naText")}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 min-w-0">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{order.location}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 min-w-0">
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{formatDate(order.createdAt)}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-600 dark:text-gray-400">{t("shopkeeper.orders.amountLabel")}</p>
                          <p className="text-lg sm:text-2xl font-bold text-amber-600 truncate">{formatMoney(order.amount)}</p>
                        </div>

                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedOrder(order)
                              setShowOrderDetails(true)
                            }}
                            className="bg-transparent"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            {t("shopkeeper.orders.viewButton")}
                          </Button>

                          {!isFinal && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button size="sm" variant="outline" className="bg-transparent" disabled={isBusy}>
                                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {order.status === "pending" && (
                                  <DropdownMenuItem onClick={() => handleAdvance(order.id, "processing")}>
                                    {t("shopkeeper.orders.markProcessing")}
                                  </DropdownMenuItem>
                                )}
                                {order.status === "processing" && (
                                  <DropdownMenuItem onClick={() => handleAdvance(order.id, "shipped")}>
                                    {t("shopkeeper.orders.markShipped")}
                                  </DropdownMenuItem>
                                )}
                                {order.status === "shipped" && (
                                  <DropdownMenuItem onClick={() => handleAdvance(order.id, "delivered")}>
                                    {t("shopkeeper.orders.markDelivered")}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={handlePrint}>
                                  <Printer className="w-4 h-4 mr-2" />
                                  {t("shopkeeper.orders.printInvoice")}
                                </DropdownMenuItem>
                                {(order.status === "pending" || order.status === "processing") && (
                                  <DropdownMenuItem className="text-red-600" onClick={() => handleCancel(order.id)}>
                                    {t("shopkeeper.orders.cancelOrder")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })
          ) : (
            <div className="text-center py-12">
              <Package className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
              <p className="text-gray-600 dark:text-gray-400">{t("shopkeeper.orders.noOrdersFound")}</p>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Order Details Modal */}
      <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("shopkeeper.orders.orderDetailsTitle", { orderNumber: selectedOrder?.orderNumber ?? "" })}</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-6 py-4">
              <div>
                <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">{t("common.status")}</h3>
                <div className={`px-4 py-2 rounded-lg border ${getStatusColor(selectedOrder.status)}`}>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedOrder.status)}
                    <span className="font-medium">{getStatusLabel(selectedOrder.status)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 rounded-lg min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t("common.customer")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white break-words">{selectedOrder.customerName}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 rounded-lg min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t("shopkeeper.orders.phoneLabel")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white break-words">{selectedOrder.customerPhone ?? t("shopkeeper.orders.naText")}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 rounded-lg min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t("shopkeeper.orders.emailLabel")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white break-all">{selectedOrder.customerEmail}</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 sm:p-4 rounded-lg min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{t("shopkeeper.orders.paymentMethodLabel")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white break-words">{selectedOrder.paymentMethod}</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">{t("shopkeeper.orders.deliveryAddressLabel")}</h3>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <p className="text-gray-900 dark:text-white">{selectedOrder.location}</p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold mb-3 text-gray-900 dark:text-white">{t("shopkeeper.orders.itemsLabel")}</h3>
                <div className="space-y-3">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 sm:gap-4">
                      <div className="relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200">
                        <Image src={item.image || "/placeholder.svg"} alt={item.productName} fill className="object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white truncate">{item.productName}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{t("shopkeeper.orders.quantityAtPrice", { qty: item.quantity, price: formatMoney(item.unitPrice) })}</p>
                      </div>
                      <p className="font-bold text-amber-600 flex-shrink-0">{formatMoney(item.totalPrice)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{t("shopkeeper.orders.subtotalLabel")}</span>
                    <span>{formatMoney(selectedOrder.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>{t("shopkeeper.orders.shippingLabel")}</span>
                    <span>{formatMoney(selectedOrder.shippingCost)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 dark:text-white text-base pt-1">
                    <span>{t("payment.total")}</span>
                    <span>{formatMoney(selectedOrder.amount)}</span>
                  </div>
                </div>
              </div>

              {selectedOrder.notes && (
                <div>
                  <h3 className="font-semibold mb-2 text-gray-900 dark:text-white">{t("shopkeeper.orders.notesLabel")}</h3>
                  <p className="text-gray-700 dark:text-gray-300">{selectedOrder.notes}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  variant="outline"
                  onClick={() => setShowOrderDetails(false)}
                  className="flex-1 bg-transparent"
                >
                  {t("common.close")}
                </Button>
                <Button
                  onClick={handlePrint}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  {t("shopkeeper.orders.printInvoice")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
