"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import {
  TrendingUp, Wallet, Calendar, ArrowUpRight, AlertCircle, Plus,
  CheckCircle2, Smartphone, Building2, Globe, ChevronRight, X, ArrowLeft, Clock, Loader2
} from "lucide-react"
import {
  getShopkeeperEarningsSummary, requestShopkeeperWithdrawal,
  type ShopkeeperEarningsSummary,
} from "@/backend/actions/shopkeeper-earnings"
import { useWalletTopupReturn } from "@/frontend/lib/hooks/useWalletTopupReturn"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"
import { WalletTopupMethods } from "@/frontend/components/payment/wallet-topup-methods"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function ShopkeeperEarningsPage() {
  const { handleGateFailure } = useGatedAction()
  const { t, tn, formatMoney, currency } = useLocalization()
  const paymentMethods = [
    { id: "mpesa", name: t("payment.mpesa"), icon: Smartphone, description: t("shopkeeper.earnings.mpesaMethodDesc") },
    { id: "bank", name: t("shopkeeper.earnings.bankMethodName"), icon: Building2, description: t("shopkeeper.earnings.bankMethodDesc") },
    { id: "paypal", name: t("payment.paypal"), icon: Globe, description: t("shopkeeper.earnings.paypalMethodDesc") },
  ]
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<ShopkeeperEarningsSummary>(null)
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false)
  const [withdrawStep, setWithdrawStep] = useState(1) // 1: amount, 2: payment method, 3: confirmation
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawDetails, setWithdrawDetails] = useState("")
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [showAddMoney, setShowAddMoney] = useState(false)
  const [addMoneyAmount, setAddMoneyAmount] = useState("")
  const [confirmedAddAmount, setConfirmedAddAmount] = useState<number | null>(null)

  const refresh = async () => {
    const summary = await getShopkeeperEarningsSummary()
    setData(summary)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const topupReturnMessage = useWalletTopupReturn({
    returnPath: "/shopkeeper/earnings",
    onSettled: refresh,
    messages: {
      paypalSuccess: t("shopkeeper.earnings.paypalTopupSuccess"),
      paypalFailed: t("shopkeeper.earnings.paypalTopupFailed"),
      cardSuccess: t("shopkeeper.earnings.cardTopupSuccess"),
      cardUnconfirmed: t("shopkeeper.earnings.cardTopupUnconfirmed"),
    },
  })

  const closeAddMoney = () => {
    setShowAddMoney(false)
    setAddMoneyAmount("")
    setConfirmedAddAmount(null)
  }

  const handleWithdrawClick = () => {
    setShowWithdrawDialog(true)
    setWithdrawStep(1)
    setWithdrawAmount("")
    setWithdrawDetails("")
    setSelectedPaymentMethod(null)
    setError("")
    setSuccess("")
  }

  const handleAmountSubmit = () => {
    setError("")
    const amount = parseFloat(withdrawAmount)

    if (!withdrawAmount || isNaN(amount)) {
      setError(t("shopkeeper.earnings.enterValidAmount"))
      return
    }
    if (amount < 100) {
      setError(t("shopkeeper.earnings.minAmountError", { amount: formatMoney(100) }))
      return
    }
    if (!data || amount > data.available) {
      setError(t("shopkeeper.earnings.exceedsBalanceError", { amount: formatMoney(data?.available ?? 0) }))
      return
    }

    setWithdrawStep(2)
  }

  const handlePaymentMethodSelect = (methodId: string) => {
    setSelectedPaymentMethod(methodId)
    setWithdrawStep(3)
  }

  const handleConfirmWithdrawal = async () => {
    if (!selectedPaymentMethod || !withdrawAmount) {
      setError(t("shopkeeper.earnings.invalidDetailsError"))
      return
    }
    if (!withdrawDetails.trim()) {
      setError(t("shopkeeper.earnings.enterPayoutDetailsError"))
      return
    }

    setIsSubmitting(true)
    const result = await requestShopkeeperWithdrawal({
      amount: parseFloat(withdrawAmount),
      method: selectedPaymentMethod,
      details: withdrawDetails,
    })
    setIsSubmitting(false)

    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the
      // merchant with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setError(result.error)
      return
    }

    const methodName = paymentMethods.find(m => m.id === selectedPaymentMethod)?.name
    setSuccess(t("shopkeeper.earnings.withdrawalSuccess", { amount: formatMoney(parseFloat(withdrawAmount)), method: methodName ?? "" }))
    await refresh()
    setTimeout(() => {
      setShowWithdrawDialog(false)
      setTimeout(() => setSuccess(""), 5000)
    }, 1500)
  }

  const handleCloseDialog = () => {
    setShowWithdrawDialog(false)
    setWithdrawStep(1)
    setWithdrawAmount("")
    setWithdrawDetails("")
    setSelectedPaymentMethod(null)
    setError("")
  }

  const formatDate = (iso: string) => {
    const date = new Date(iso)
    const diffMs = Date.now() - date.getTime()
    const days = Math.floor(diffMs / 86400000)
    if (days === 0) return t("shopkeeper.earnings.todayLabel")
    if (days === 1) return t("shopkeeper.earnings.yesterdayLabel")
    if (days < 7) return tn("shopkeeper.earnings.daysAgo", days)
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Loaded, but the account has no shop to report on. This used to share the
  // branch above, so anything that made the fetch come back empty left the
  // page spinning forever with nothing to act on.
  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{t("shopkeeper.earnings.unavailableTitle")}</p>
        <p className="max-w-xs text-xs text-muted-foreground">{t("shopkeeper.earnings.unavailableBody")}</p>
      </div>
    )
  }

  const availableBalance = formatMoney(data.available)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-3 sm:p-4 lg:p-8 overflow-x-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-8 min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2 truncate">{t("shopkeeper.earnings.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 text-xs sm:text-sm truncate">{t("shopkeeper.earnings.subtitle")}</p>
        </div>

        {success && (
          <Card className="p-4 mb-6 border-0 shadow-lg bg-emerald-50 dark:bg-emerald-900/30 border-l-4 border-emerald-600">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-emerald-900 dark:text-emerald-100">{success}</p>
              </div>
            </div>
          </Card>
        )}

        {topupReturnMessage && (
          <Card className={`p-4 mb-6 border-0 shadow-lg border-l-4 ${topupReturnMessage.type === "success" ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-600" : "bg-red-50 dark:bg-red-900/30 border-red-600"}`}>
            <p className={`font-semibold ${topupReturnMessage.type === "success" ? "text-emerald-900 dark:text-emerald-100" : "text-red-900 dark:text-red-100"}`}>{topupReturnMessage.text}</p>
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-6 mb-6 sm:mb-8">
          <Card className="p-2.5 sm:p-6 border-0 shadow-lg hover:shadow-xl transition-shadow min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-2 sm:mb-4">
              <p className="text-gray-600 dark:text-gray-400 text-[10px] sm:text-xs font-medium truncate min-w-0">{t("shopkeeper.earnings.statTotalEarnings")}</p>
              <div className="p-1.5 sm:p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex-shrink-0">
                <TrendingUp className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-emerald-600" />
              </div>
            </div>
            <p className="text-sm sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(data.totalEarnings)}</p>
            <p className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 sm:mt-2 truncate">{t("shopkeeper.earnings.allTimeEarnings")}</p>
          </Card>

          <Card className="p-2.5 sm:p-6 border-0 shadow-lg hover:shadow-xl transition-shadow min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-2 sm:mb-4">
              <p className="text-gray-600 dark:text-gray-400 text-[10px] sm:text-xs font-medium truncate min-w-0">{t("shopkeeper.earnings.statThisMonth")}</p>
              <div className="p-1.5 sm:p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                <Calendar className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-sm sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(data.thisMonth)}</p>
            <p className="text-[10px] sm:text-[11px] text-blue-600 dark:text-blue-400 mt-1 sm:mt-2 truncate">{new Date().toLocaleDateString([], { month: "long", year: "numeric" })}</p>
          </Card>

          <Card className="p-2.5 sm:p-6 border-0 shadow-lg hover:shadow-xl transition-shadow bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-2 sm:mb-4">
              <p className="text-gray-600 dark:text-gray-400 text-[10px] sm:text-xs font-medium truncate min-w-0">{t("shopkeeper.earnings.statAvailable")}</p>
              <div className="p-1.5 sm:p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex-shrink-0">
                <Wallet className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-amber-600" />
              </div>
            </div>
            <p className="text-sm sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{availableBalance}</p>
            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2 mt-2 sm:mt-4">
              <Button
                onClick={() => setShowAddMoney(true)}
                variant="outline"
                className="flex-1 h-7 sm:h-9 px-2 text-[10px] sm:text-xs font-medium bg-transparent"
              >
                <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                <span className="truncate">{t("shopkeeper.earnings.addMoney")}</span>
              </Button>
              <Button
                onClick={handleWithdrawClick}
                className="flex-1 bg-amber-600 hover:bg-amber-700 h-7 sm:h-9 px-2 text-[10px] sm:text-xs font-medium"
                disabled={data.available < 100}
              >
                <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 flex-shrink-0" />
                <span className="truncate">{t("shopkeeper.earnings.withdrawFunds")}</span>
              </Button>
            </div>
          </Card>

          <Card className="p-2.5 sm:p-6 border-0 shadow-lg hover:shadow-xl transition-shadow min-w-0">
            <div className="flex items-center justify-between gap-1.5 mb-2 sm:mb-4">
              <p className="text-gray-600 dark:text-gray-400 text-[10px] sm:text-xs font-medium truncate min-w-0">{t("shopkeeper.earnings.statPending")}</p>
              <div className="p-1.5 sm:p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex-shrink-0">
                <Clock className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-purple-600" />
              </div>
            </div>
            <p className="text-sm sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{formatMoney(data.pending)}</p>
            <p className="text-[10px] sm:text-[11px] text-purple-600 dark:text-purple-400 mt-1 sm:mt-2 truncate">{t("shopkeeper.earnings.processingHint")}</p>
          </Card>
        </div>

        <Card className="border-0 shadow-lg">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("shopkeeper.earnings.transactionHistory")}</h2>
          </div>

          {data.transactions.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-12">{t("shopkeeper.earnings.noTransactionsYet")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-6 text-xs font-semibold text-gray-900 dark:text-white">{t("shopkeeper.earnings.colType")}</th>
                    <th className="text-left p-6 text-xs font-semibold text-gray-900 dark:text-white">{t("shopkeeper.earnings.colDescription")}</th>
                    <th className="text-left p-6 text-xs font-semibold text-gray-900 dark:text-white">{t("shopkeeper.earnings.colAmount")}</th>
                    <th className="text-left p-6 text-xs font-semibold text-gray-900 dark:text-white">{t("shopkeeper.earnings.colDate")}</th>
                    <th className="text-left p-6 text-xs font-semibold text-gray-900 dark:text-white">{t("shopkeeper.earnings.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="p-6 text-xs text-gray-900 dark:text-white font-medium">{tx.type === "credit" ? t("shopkeeper.earnings.typeSale") : t("shopkeeper.earnings.typeWithdrawal")}</td>
                      <td className="p-6 text-xs text-gray-600 dark:text-gray-400">{tx.description}</td>
                      <td className={`p-6 text-xs font-semibold ${tx.type === "credit" ? "text-emerald-600" : "text-orange-600"}`}>
                        {tx.type === "credit" ? "+" : "-"}{formatMoney(tx.amount)}
                      </td>
                      <td className="p-6 text-xs text-gray-600 dark:text-gray-400">{formatDate(tx.date)}</td>
                      <td className="p-6">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                          tx.status === "completed"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        }`}>
                          {tx.status === "completed" ? t("shopkeeper.earnings.statusCompleted") : t("shopkeeper.earnings.statusProcessing")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Withdrawal Wizard Dialog */}
      <Dialog open={showWithdrawDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
            <div>
              <DialogTitle>{t("shopkeeper.earnings.withdrawFundsTitle")}</DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-1">{t("shopkeeper.earnings.stepOf", { step: withdrawStep })}</p>
            </div>
            <button onClick={handleCloseDialog} aria-label={t("common.close")} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </DialogHeader>

          <div className="py-6">
            {withdrawStep === 1 && (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-4">{t("shopkeeper.earnings.availableBalanceLabel")} <span className="font-bold text-foreground">{availableBalance}</span></p>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-2">{t("shopkeeper.earnings.withdrawalAmountLabel", { currency })}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{currency}</span>
                    <Input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => {
                        setWithdrawAmount(e.target.value)
                        setError("")
                      }}
                      placeholder={t("shopkeeper.earnings.amountPlaceholder")}
                      className="pl-12"
                      min="100"
                      max={data.available}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{t("shopkeeper.earnings.minWithdrawalHint", { amount: formatMoney(100) })}</p>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={handleCloseDialog} className="flex-1 bg-transparent">
                    {t("shopkeeper.earnings.cancelButton")}
                  </Button>
                  <Button onClick={handleAmountSubmit} className="flex-1 bg-amber-600 hover:bg-amber-700">
                    {t("shopkeeper.earnings.nextButton")}
                  </Button>
                </div>
              </div>
            )}

            {withdrawStep === 2 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">{t("shopkeeper.earnings.withdrawAmountSummary", { amount: formatMoney(parseFloat(withdrawAmount) || 0) })}</p>
                <p className="text-xs font-medium text-foreground">{t("shopkeeper.earnings.selectPaymentMethod")}</p>

                <div className="space-y-3">
                  {paymentMethods.map((method) => {
                    const Icon = method.icon
                    return (
                      <button
                        key={method.id}
                        onClick={() => handlePaymentMethodSelect(method.id)}
                        className="w-full p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                              <Icon className="w-5 h-5 text-amber-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{method.name}</p>
                              <p className="text-[11px] text-muted-foreground">{method.description}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={() => setWithdrawStep(1)} className="flex-1 bg-transparent gap-2">
                    <ArrowLeft className="w-4 h-4" />
                    {t("shopkeeper.earnings.backButton")}
                  </Button>
                </div>
              </div>
            )}

            {withdrawStep === 3 && (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">{t("shopkeeper.earnings.summaryAmount")}</p>
                    <p className="font-semibold text-foreground">{formatMoney(parseFloat(withdrawAmount) || 0)}</p>
                  </div>
                  <div className="h-px bg-gray-200 dark:bg-gray-700" />
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">{t("shopkeeper.earnings.summaryPaymentMethod")}</p>
                    <p className="font-semibold text-foreground">{paymentMethods.find(m => m.id === selectedPaymentMethod)?.name}</p>
                  </div>
                  <div className="h-px bg-gray-200 dark:bg-gray-700" />
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-muted-foreground">{t("shopkeeper.earnings.summaryNewBalance")}</p>
                    <p className="font-semibold text-emerald-600">{formatMoney(data.available - (parseFloat(withdrawAmount) || 0))}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-2">
                    {selectedPaymentMethod === "mpesa" ? t("shopkeeper.earnings.mpesaPhoneLabel") : selectedPaymentMethod === "bank" ? t("shopkeeper.earnings.bankAccountLabel") : t("shopkeeper.earnings.paypalEmailLabel")}
                  </label>
                  <Input
                    value={withdrawDetails}
                    onChange={(e) => setWithdrawDetails(e.target.value)}
                    placeholder={selectedPaymentMethod === "mpesa" ? t("shopkeeper.earnings.mpesaPlaceholder") : selectedPaymentMethod === "bank" ? t("shopkeeper.earnings.bankPlaceholder") : t("shopkeeper.earnings.paypalPlaceholder")}
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    {t("shopkeeper.earnings.processingTimeHint")}
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button variant="outline" onClick={() => setWithdrawStep(2)} className="flex-1 bg-transparent gap-2" disabled={isSubmitting}>
                    <ArrowLeft className="w-4 h-4" />
                    {t("shopkeeper.earnings.backButton")}
                  </Button>
                  <Button onClick={handleConfirmWithdrawal} className="flex-1 bg-emerald-600 hover:bg-emerald-700" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.earnings.confirmWithdrawal")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Money Modal — funds this wallet for placing distributor/wholesale orders */}
      <Dialog open={showAddMoney} onOpenChange={(open) => { if (!open) closeAddMoney(); else setShowAddMoney(true) }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>{t("shopkeeper.earnings.addMoney")}</DialogTitle></DialogHeader>
          {confirmedAddAmount == null ? (
            <div className="space-y-4 py-2">
              <div>
                <label className="text-xs font-medium mb-2 block">{t("shopkeeper.earnings.addMoneyAmountLabel")}</label>
                <div className="flex gap-2">
                  <span className="flex items-center px-3 bg-muted rounded-xl text-xs text-muted-foreground">{currency}</span>
                  <Input type="number" placeholder="0" value={addMoneyAmount} onChange={(e) => setAddMoneyAmount(e.target.value)} className="rounded-xl" />
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {[1000, 5000, 10000, 20000].map((amt) => (
                  <button key={amt} onClick={() => setAddMoneyAmount(amt.toString())} className="px-3 py-1.5 bg-muted rounded-lg text-xs font-medium hover:bg-muted/80 transition-colors">{formatMoney(amt)}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 rounded-xl"
                  onClick={() => { const amt = Number.parseFloat(addMoneyAmount); if (amt > 0) setConfirmedAddAmount(amt) }}
                  disabled={!(Number.parseFloat(addMoneyAmount) > 0)}
                >
                  {t("shopkeeper.earnings.continueButton")}
                </Button>
                <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={closeAddMoney}>{t("shopkeeper.earnings.cancelButton")}</Button>
              </div>
            </div>
          ) : (
            <WalletTopupMethods
              amount={confirmedAddAmount}
              returnPath="/shopkeeper/earnings"
              onSuccess={() => { refresh(); setTimeout(closeAddMoney, 1500) }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
