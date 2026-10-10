"use client"

import { useEffect, useState } from "react"
import {
  Wallet, ArrowUpRight, ArrowDownLeft, TrendingUp, Building2, Smartphone,
  ChevronRight, Clock, CheckCircle2, AlertCircle, Download, Filter,
  Eye, EyeOff, AlertTriangle, CreditCard, Send, Loader2
} from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { Input } from "@/frontend/components/ui/input"
import { Label } from "@/frontend/components/ui/label"
import { getProviderWalletSummary, requestProviderWithdrawal, type ProviderWalletSummary } from "@/backend/actions/provider-wallet"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"
import type { TranslationKey } from "@/backend/domain/i18n"

export default function ProviderWalletPage() {
  const { handleGateFailure } = useGatedAction()
  const { t, formatMoney, currency } = useLocalization()

  const withdrawMethods: { id: string; nameKey: TranslationKey; icon: typeof Smartphone; detailKey: TranslationKey; placeholderKey: TranslationKey; default?: boolean }[] = [
    { id: "mpesa", nameKey: "payment.mpesa", icon: Smartphone, detailKey: "provider.wallet.detailInstantMobile", placeholderKey: "provider.wallet.placeholderPhone", default: true },
    { id: "airtel", nameKey: "provider.wallet.methodAirtelMoney", icon: Send, detailKey: "provider.wallet.detailInstantAirtel", placeholderKey: "provider.wallet.placeholderAirtel" },
    { id: "bank", nameKey: "provider.wallet.methodBankTransfer", icon: Building2, detailKey: "provider.wallet.detailBankDays", placeholderKey: "provider.wallet.placeholderAccountNumber" },
    { id: "card", nameKey: "provider.wallet.methodCardPayout", icon: CreditCard, detailKey: "provider.wallet.detailCardSettlement", placeholderKey: "provider.wallet.placeholderCardDigits" },
  ]

  const [activeTab, setActiveTab] = useState("overview")
  const [showBalance, setShowBalance] = useState(true)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawMethod, setWithdrawMethod] = useState<string | null>("mpesa")
  const [withdrawDetails, setWithdrawDetails] = useState("")
  const [withdrawError, setWithdrawError] = useState("")
  const [isWithdrawing, setIsWithdrawing] = useState(false)

  const [isLoading, setIsLoading] = useState(true)
  const [summary, setSummary] = useState<ProviderWalletSummary>(null)

  const refresh = () => getProviderWalletSummary().then(setSummary)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const formatCurrency = (amount: number) => formatMoney(amount)
  const percentChange = summary && summary.lastMonth > 0
    ? (((summary.thisMonth - summary.lastMonth) / summary.lastMonth) * 100).toFixed(1)
    : "0.0"

  const handleWithdraw = async () => {
    setWithdrawError("")
    const amount = parseFloat(withdrawAmount)

    if (!withdrawMethod) { setWithdrawError(t("provider.wallet.selectMethodError")); return }
    if (!withdrawDetails.trim()) {
      const method = withdrawMethods.find((item) => item.id === withdrawMethod)
      setWithdrawError(method ? t("provider.wallet.enterMethodDetailsError", { method: t(method.nameKey).toLowerCase() }) : t("provider.wallet.selectMethodError"))
      return
    }

    setIsWithdrawing(true)
    const result = await requestProviderWithdrawal({ amount, method: withdrawMethod, details: withdrawDetails })
    setIsWithdrawing(false)
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the user
      // with a message and nowhere to act on it.
      if (handleGateFailure(result)) return
      setWithdrawError(result.error)
      return
    }

    setShowWithdraw(false)
    setWithdrawAmount("")
    setWithdrawDetails("")
    await refresh()
  }

  const handleDownloadStatement = () => {
    if (!summary) return
    const headers = ["Date", "Description", "Amount", "Status"]
    const rows = summary.transactions.map((tx) => [new Date(tx.date).toLocaleString(), tx.title, `${tx.type === 'credit' ? '+' : '-'} ${formatMoney(tx.amount)}`, tx.status])
    const csvContent = [[`Transaction Statement - ${new Date().toLocaleDateString()}`], [], headers, ...rows]
    const csv = csvContent.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.setAttribute("href", URL.createObjectURL(blob))
    link.setAttribute("download", `wallet-statement-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (isLoading || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  const selectedWithdrawMethod = withdrawMethods.find((item) => item.id === withdrawMethod)

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,_rgba(240,253,250,1),_rgba(248,250,252,1))] pb-6 dark:bg-[linear-gradient(135deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]">
      <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-600 p-6 text-white lg:rounded-b-3xl">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="mb-1 text-xs text-emerald-100">{t("provider.wallet.totalBalance")}</p>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold lg:text-3xl">{showBalance ? formatCurrency(summary.balance) : `${currency} ****`}</h1>
                <button onClick={() => setShowBalance(!showBalance)} aria-label={showBalance ? t("common.hideBalance") : t("common.showBalance")} className="rounded-full p-1.5 transition-colors hover:bg-white/10">{showBalance ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button>
              </div>
            </div>
            <div className="text-right">
              <div className="mb-1 flex items-center gap-1 text-xs text-emerald-100"><TrendingUp className="h-4 w-4" /> {Number(percentChange) >= 0 ? "+" : ""}{percentChange}%</div>
              <p className="text-[11px] text-emerald-200">{t("provider.wallet.versusLastMonth")}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <p className="mb-1 text-[11px] text-emerald-100">{t("provider.wallet.available")}</p>
              <p className="text-base font-semibold">{showBalance ? formatCurrency(summary.available) : '****'}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <p className="mb-1 text-[11px] text-emerald-100">{t("provider.wallet.pending")}</p>
              <p className="text-base font-semibold">{showBalance ? formatCurrency(summary.pending) : '****'}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 backdrop-blur-sm">
              <p className="mb-1 text-[11px] text-emerald-100">{t("provider.wallet.escrow")}</p>
              <p className="text-base font-semibold">{showBalance ? formatCurrency(summary.escrow) : '****'}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => setShowWithdraw(true)} className="h-12 flex-1 bg-white font-semibold text-emerald-700 hover:bg-emerald-50"><ArrowUpRight className="mr-2 h-5 w-5" />{t("provider.wallet.withdraw")}</Button>
            <Button variant="outline" className="h-12 flex-1 border-2 border-white/30 bg-transparent font-semibold text-white hover:bg-white/10" onClick={handleDownloadStatement}><Download className="mr-2 h-5 w-5" />{t("provider.wallet.statement")}</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 -mt-4">
        <Card className="mb-4 border-0 p-2 shadow-lg">
          <div className="flex gap-1">
            {(['overview', 'transactions', 'escrow'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-medium transition-all ${activeTab === tab ? 'bg-emerald-600 text-white shadow-md' : 'text-muted-foreground hover:bg-muted'}`}>{tab === 'overview' ? t("provider.wallet.tabOverview") : tab === 'transactions' ? t("provider.wallet.tabTransactions") : t("provider.wallet.tabEscrow")}</button>
            ))}
          </div>
        </Card>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <Card className="border-0 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{t("provider.wallet.thisMonth")}</h3>
                <span className="text-[11px] text-muted-foreground">{new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 p-4 dark:bg-emerald-900/20">
                  <p className="mb-1 text-xs text-emerald-700 dark:text-emerald-400">{t("provider.wallet.earned")}</p>
                  <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(summary.thisMonth)}</p>
                </div>
                <div className="rounded-xl bg-sky-50 p-4 dark:bg-sky-900/20">
                  <p className="mb-1 text-xs text-sky-700 dark:text-sky-400">{t("provider.wallet.jobsCompleted")}</p>
                  <p className="text-lg font-bold text-sky-700 dark:text-sky-300">{summary.jobsCompletedThisMonth}</p>
                </div>
              </div>
            </Card>

            <Card className="border-0 p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold text-foreground">{t("provider.wallet.withdrawalOptions")}</h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{t("provider.wallet.fastSecure")}</span>
              </div>
              <div className="space-y-3">
                {withdrawMethods.map((method) => {
                  const IconComponent = method.icon
                  return (
                    <div key={method.id} className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"><IconComponent className="h-5 w-5" /></div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{t(method.nameKey)}</p>
                        <p className="text-[11px] text-muted-foreground">{t(method.detailKey)}</p>
                      </div>
                      {method.default && <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">{t("provider.wallet.defaultBadge")}</span>}
                    </div>
                  )
                })}
              </div>
            </Card>

            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">{t("provider.wallet.recentTransactions")}</h3>
              <Button size="sm" variant="outline" onClick={handleDownloadStatement} className="gap-2 bg-transparent"><Download className="h-4 w-4" />{t("provider.wallet.download")}</Button>
            </div>
            <div className="space-y-3">
              <Button variant="ghost" size="sm" onClick={() => setActiveTab('transactions')}>{t("provider.wallet.viewAll")} <ChevronRight className="ml-1 h-4 w-4" /></Button>
              {summary.transactions.length === 0 && <p className="text-xs text-muted-foreground px-2">{t("provider.wallet.noTransactionsYet")}</p>}
              {summary.transactions.slice(0, 3).map((transaction) => (
                <div key={transaction.id} className="flex items-center gap-3 py-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${transaction.type === 'credit' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                    {transaction.type === 'credit' ? <ArrowDownLeft className="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> : <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{transaction.title}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(transaction.date).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold ${transaction.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>{transaction.type === 'credit' ? '+' : '-'}{formatCurrency(transaction.amount)}</p>
                    <span className={`text-[11px] ${transaction.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>{transaction.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="space-y-3">
            <Card className="border-0 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline">{t("provider.wallet.filterAll")}</Button>
                  <Button size="sm" variant="ghost">{t("provider.wallet.filterIncome")}</Button>
                  <Button size="sm" variant="ghost">{t("provider.wallet.filterExpenses")}</Button>
                </div>
                <Button size="sm" variant="outline"><Filter className="mr-1 h-4 w-4" />{t("common.filter")}</Button>
              </div>
            </Card>
            {summary.transactions.length === 0 && (
              <Card className="border-0 p-8 text-center shadow-sm"><p className="text-xs text-muted-foreground">{t("provider.wallet.noTransactionsYet")}</p></Card>
            )}
            {summary.transactions.map((transaction) => (
              <Card key={transaction.id} className="border-0 p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-full ${transaction.type === 'credit' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                    {transaction.type === 'credit' ? <ArrowDownLeft className="h-6 w-6 text-emerald-600 dark:text-emerald-400" /> : <ArrowUpRight className="h-6 w-6 text-red-600 dark:text-red-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{transaction.title}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{new Date(transaction.date).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-base font-bold ${transaction.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>{transaction.type === 'credit' ? '+' : '-'}{formatCurrency(transaction.amount)}</p>
                    <span className={`mt-1 inline-flex items-center gap-1 text-[11px] ${transaction.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>{transaction.status === 'completed' ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{transaction.status}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'escrow' && (
          <div className="space-y-4">
            <Card className="border-0 bg-sky-50 p-5 shadow-sm dark:bg-sky-900/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-sky-600" />
                <div>
                  <h4 className="font-medium text-sky-900 dark:text-sky-200">{t("provider.wallet.aboutEscrowTitle")}</h4>
                  <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">{t("provider.wallet.aboutEscrowDesc")}</p>
                </div>
              </div>
            </Card>
            {summary.escrowJobs.length === 0 ? (
              <Card className="border-0 p-8 text-center shadow-sm"><Wallet className="mx-auto mb-3 h-12 w-12 text-muted-foreground" /><h3 className="mb-1 font-semibold text-foreground">{t("provider.wallet.noActiveEscrowTitle")}</h3><p className="text-xs text-muted-foreground">{t("provider.wallet.noActiveEscrowDesc")}</p></Card>
            ) : summary.escrowJobs.map((payment) => (
              <Card key={payment.id} className="border-0 p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between"><h4 className="font-semibold text-foreground">{payment.job}</h4><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t("provider.wallet.awaitingCompletion")}</span></div>
                <p className="mb-3 text-xs text-muted-foreground">{t("provider.wallet.clientLabel")} {payment.client}</p>
                <div className="flex items-center justify-between"><div><p className="text-[11px] text-muted-foreground">{t("provider.wallet.amountLabel")}</p><p className="text-lg font-bold text-emerald-600">{formatCurrency(payment.amount)}</p></div><div className="text-right"><p className="text-[11px] text-muted-foreground">{t("provider.wallet.scheduledLabel")}</p><p className="text-xs font-medium text-foreground">{new Date(payment.dueDate).toLocaleDateString()}</p></div></div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showWithdraw} onOpenChange={(open) => { setShowWithdraw(open); if (!open) setWithdrawError("") }}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t("provider.wallet.withdrawFundsTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-2xl bg-emerald-50 p-4 text-center dark:bg-emerald-900/20">
              <p className="mb-1 text-xs text-emerald-700 dark:text-emerald-400">{t("provider.wallet.availableBalance")}</p>
              <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(summary.available)}</p>
            </div>

            <div>
              <Label>{t("provider.wallet.amountKesLabel")}</Label>
              <Input type="number" placeholder={t("provider.wallet.enterAmountPlaceholder")} value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} className="mt-1.5" />
            </div>

            <div>
              <Label>{t("provider.wallet.withdrawToLabel")}</Label>
              <div className="mt-1.5 space-y-2">
                {withdrawMethods.map((method) => {
                  const IconComponent = method.icon
                  return (
                    <button key={method.id} onClick={() => { setWithdrawMethod(method.id); setWithdrawDetails('') }} className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${withdrawMethod === method.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-border hover:border-emerald-300'}`}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><IconComponent className="h-5 w-5" /></div>
                      <div>
                        <p className="font-medium text-foreground">{t(method.nameKey)}</p>
                        <p className="text-[11px] text-muted-foreground">{t(method.detailKey)}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {withdrawMethod && selectedWithdrawMethod && (
              <div>
                <Label>{t("provider.wallet.methodDetailsLabel", { method: t(selectedWithdrawMethod.nameKey) })}</Label>
                <Input value={withdrawDetails} onChange={(event) => setWithdrawDetails(event.target.value)} placeholder={t(selectedWithdrawMethod.placeholderKey)} className="mt-1.5" />
              </div>
            )}

            {withdrawError && <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400"><AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>{withdrawError}</span></div>}

            <Button className="h-12 w-full bg-emerald-600 hover:bg-emerald-700" disabled={!withdrawAmount || !withdrawMethod || isWithdrawing} onClick={handleWithdraw}>
              {isWithdrawing ? <Loader2 className="h-4 w-4 animate-spin" /> : t("provider.wallet.confirmWithdrawal")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
