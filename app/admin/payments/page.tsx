"use client"

import { useEffect, useState } from "react"
import { Search, Download, Eye, TrendingUp, Clock, CreditCard, Wallet, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getAdminPayments, recheckPaymentStatus,
  type AdminPayment, type AdminPaymentStatus,
} from "@/lib/actions/admin-payments"

const STATUS_COLOR: Record<AdminPaymentStatus, string> = {
  Completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  Pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  Processing: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
  Failed: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  Refunded: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
}

export default function PaymentsPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [activeFilter, setActiveFilter] = useState<"All" | AdminPaymentStatus>("All")
  const [selectedPayment, setSelectedPayment] = useState<AdminPayment | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isRechecking, setIsRechecking] = useState(false)

  const STATUS_LABEL: Record<AdminPaymentStatus, string> = {
    Completed: t("admin.payments.statusCompleted"),
    Pending: t("admin.payments.statusPending"),
    Processing: t("admin.payments.statusProcessing"),
    Failed: t("admin.payments.statusFailed"),
    Refunded: t("admin.payments.statusRefunded"),
  }

  const refresh = async () => {
    const data = await getAdminPayments()
    setPayments(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filters: { label: string; type: "All" | AdminPaymentStatus }[] = [
    { label: t("admin.payments.statusAll"), type: "All" },
    { label: STATUS_LABEL.Completed, type: "Completed" },
    { label: STATUS_LABEL.Pending, type: "Pending" },
    { label: STATUS_LABEL.Processing, type: "Processing" },
    { label: STATUS_LABEL.Failed, type: "Failed" },
  ]

  const filteredPayments = payments.filter(p => {
    const matchesSearch = p.user.toLowerCase().includes(searchTerm.toLowerCase()) || p.context.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = activeFilter === "All" || p.status === activeFilter
    return matchesSearch && matchesFilter
  })

  const handleExportPayments = () => {
    const data = {
      exportDate: new Date().toISOString(),
      totalPayments: payments.length,
      payments: payments.map(p => ({ id: p.id, user: p.user, context: p.context, amount: p.amount, method: p.method, status: p.status, date: p.date })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments-export-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleRecheck = async (paymentId: string) => {
    setIsRechecking(true)
    const result = await recheckPaymentStatus({ paymentId })
    setIsRechecking(false)
    if (!result.success) { alert(result.error); return }
    await refresh()
    setShowModal(false)
  }

  const handleViewReceipt = (payment: AdminPayment) => {
    const receiptData = {
      receiptNumber: `RCP-${Date.now()}`,
      paymentId: payment.id,
      user: payment.user,
      context: payment.context,
      amount: payment.amount,
      method: payment.method,
      status: payment.status,
      externalRef: payment.externalRef,
      date: new Date().toLocaleString(),
    }
    const blob = new Blob([JSON.stringify(receiptData, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `receipt-${payment.id}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const stats = [
    { label: t("admin.payments.statTotalTransactions"), value: payments.length, icon: CreditCard, color: "from-blue-50 to-blue-100" },
    { label: t("admin.payments.statCompleted"), value: payments.filter(p => p.status === "Completed").length, icon: TrendingUp, color: "from-emerald-50 to-emerald-100" },
    { label: t("admin.payments.statPendingProcessing"), value: payments.filter(p => p.status === "Pending" || p.status === "Processing").length, icon: Clock, color: "from-yellow-50 to-yellow-100" },
    { label: t("admin.payments.statTotalProcessed"), value: formatMoney(payments.filter(p => p.status === "Completed").reduce((sum, p) => sum + p.amount, 0)), icon: Wallet, color: "from-purple-50 to-purple-100" },
  ]

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const canRecheck = selectedPayment && (selectedPayment.status === "Pending" || selectedPayment.status === "Processing") && selectedPayment.externalRef

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("admin.payments.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.payments.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <Card key={i} className={`p-4 border-0 shadow-lg bg-gradient-to-br ${stat.color} dark:from-gray-800 dark:to-gray-800`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{stat.value}</p>
                </div>
                <Icon className="w-5 h-5 text-gray-400" />
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="w-full sm:flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t("admin.payments.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
        <Button onClick={handleExportPayments} className="bg-green-600 hover:bg-green-700 gap-2">
          <Download size={18} />
          <span className="hidden sm:inline">{t("admin.payments.export")}</span>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {filters.map((filter) => (
          <button
            key={filter.type}
            onClick={() => setActiveFilter(filter.type)}
            className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
              activeFilter === filter.type
                ? "bg-blue-600 text-white shadow-lg"
                : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("common.customer")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.payments.colContext")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.payments.colAmount")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.payments.colMethod")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("common.status")}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">{t("admin.disputes.colAction")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredPayments.length > 0 ? filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{payment.user}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{payment.context}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">{formatMoney(payment.amount)}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{payment.method}</td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[payment.status]}`}>
                      {STATUS_LABEL[payment.status] ?? payment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button onClick={() => { setSelectedPayment(payment); setShowModal(true) }} className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-blue-600">
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">{t("admin.payments.noPaymentsFound")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.payments.modalTitle")}</DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("admin.disputes.userLabel")}</span>
                  <span className="font-semibold">{selectedPayment.user}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("admin.payments.contextLabel")}</span>
                  <span className="font-semibold">{selectedPayment.context}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("admin.payments.amountLabel")}</span>
                  <span className="font-semibold">{formatMoney(selectedPayment.amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("admin.payments.methodLabel")}</span>
                  <span className="font-semibold">{selectedPayment.method}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">{t("admin.payments.statusLabel")}</span>
                  <span className="font-semibold">{STATUS_LABEL[selectedPayment.status] ?? selectedPayment.status}</span>
                </div>
                {selectedPayment.externalRef && (
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">{t("admin.payments.gatewayRefLabel")}</span>
                    <span className="font-mono text-xs">{selectedPayment.externalRef}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => handleViewReceipt(selectedPayment)}>
                  {t("admin.payments.viewReceipt")}
                </Button>
                {canRecheck && (
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => handleRecheck(selectedPayment.id)} disabled={isRechecking}>
                    {isRechecking ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.payments.checkStatus")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
