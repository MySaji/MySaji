"use client"

import { useEffect, useState } from "react"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"
import { getWalletSummary, requestWithdrawal, addPaymentMethod, type WalletSummary } from "@/backend/actions/wallet"
import { useWalletTopupReturn } from "@/frontend/lib/hooks/useWalletTopupReturn"
import { WalletTopupMethods } from "@/frontend/components/payment/wallet-topup-methods"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import {
  Plus, Eye, EyeOff, CreditCard, TrendingUp, Minus, Download, ArrowUpRight, ArrowDownLeft, Wallet, Receipt, Loader2,
  ShieldCheck, AlertCircle, Clock,
  ArrowLeft,
} from "lucide-react"

export function CustomerWalletPage() {
  const { handleGateFailure } = useGatedAction()
  const { t, formatMoney, currency } = useLocalization()
  const [showBalance, setShowBalance] = useState(true)
  const [activeTab, setActiveTab] = useState("transactions")
  const [showAddMethod, setShowAddMethod] = useState(false)
  const [newMethodType, setNewMethodType] = useState("")
  const [showAddMoney, setShowAddMoney] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [addMoneyAmount, setAddMoneyAmount] = useState("")
  const [confirmedAddAmount, setConfirmedAddAmount] = useState<number | null>(null)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawMethodId, setWithdrawMethodId] = useState<string | null>(null)
  const [paymentForm, setPaymentForm] = useState({ mpesaPhone: "", cardNumber: "", cardName: "", expiryDate: "", cvv: "", paypalEmail: "" })

  const [summary, setSummary] = useState<WalletSummary>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = () => getWalletSummary().then(setSummary)

  useEffect(() => {
    refresh()
    setIsLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const returnMessage = useWalletTopupReturn({
    returnPath: "/customer/wallet",
    onSettled: refresh,
    messages: {
      paypalSuccess: t("customer.wallet.paypalTopupSuccess"),
      paypalFailed: t("customer.wallet.paypalTopupFailed"),
      cardSuccess: t("customer.wallet.cardTopupSuccess"),
      cardUnconfirmed: t("customer.wallet.cardTopupUnconfirmed"),
    },
  })

  const handleTopupSuccess = async () => {
    await refresh()
  }

  const closeAddMoney = () => {
    setShowAddMoney(false)
    setAddMoneyAmount("")
    setConfirmedAddAmount(null)
  }

  const handleWithdraw = async () => {
    const amount = Number.parseFloat(withdrawAmount)
    if (!(amount > 0) || !withdrawMethodId) return
    setIsSubmitting(true)
    setFormError("")
    const result = await requestWithdrawal({ amount, paymentMethodId: withdrawMethodId })
    setIsSubmitting(false)
    // A verification refusal opens the wizard rather than leaving the user
    // with a message and nowhere to act on it.
    if (!result.success) {
      if (handleGateFailure(result)) return
      setFormError(result.error)
      return
    }
    await refresh()
    setShowWithdraw(false); setWithdrawAmount(""); setWithdrawMethodId(null)
  }

  const openWithdraw = () => {
    setWithdrawMethodId(summary?.paymentMethods.find((m) => m.isDefault)?.id ?? summary?.paymentMethods[0]?.id ?? null)
    setShowWithdraw(true)
  }

  const handleDownloadStatement = () => {
    if (!summary) return
    const headers = [t("customer.wallet.csvDate"), t("customer.wallet.csvType"), t("customer.wallet.csvDescription"), t("customer.wallet.csvAmount"), t("common.status")]
    const rows = summary.transactions.map((tx) => [new Date(tx.createdAt).toLocaleDateString(), tx.category, tx.description, formatMoney(Math.abs(tx.amount)), tx.status])
    const csv = [[t("customer.wallet.csvTitle")], [t("customer.wallet.csvBalance", { amount: formatMoney(summary.balance) })], [], headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `wallet-statement-${new Date().toISOString().split('T')[0]}.csv`; link.click()
  }

  const handleAddPaymentMethod = async () => {
    setIsSubmitting(true)
    setFormError("")
    const result = await addPaymentMethod({
      type: newMethodType,
      mpesaPhone: paymentForm.mpesaPhone,
      cardNumber: paymentForm.cardNumber,
      cvv: paymentForm.cvv,
      paypalEmail: paymentForm.paypalEmail,
    })
    setIsSubmitting(false)
    // A verification refusal opens the wizard rather than leaving the user
    // with a message and nowhere to act on it.
    if (!result.success) {
      if (handleGateFailure(result)) return
      setFormError(result.error)
      return
    }
    await refresh()
    setShowAddMethod(false)
    setPaymentForm({ mpesaPhone: "", cardNumber: "", cardName: "", expiryDate: "", cvv: "", paypalEmail: "" }); setNewMethodType("")
  }

  const txnConfig: Record<string, { icon: any; iconBg: string; iconColor: string }> = {
    payment: { icon: ArrowUpRight, iconBg: "bg-red-100 dark:bg-red-900/20", iconColor: "text-red-600 dark:text-red-400" },
    refund: { icon: ArrowDownLeft, iconBg: "bg-emerald-100 dark:bg-emerald-900/20", iconColor: "text-emerald-600 dark:text-emerald-400" },
    withdrawal: { icon: ArrowUpRight, iconBg: "bg-amber-100 dark:bg-amber-900/20", iconColor: "text-amber-600 dark:text-amber-400" },
    deposit: { icon: ArrowDownLeft, iconBg: "bg-blue-100 dark:bg-blue-900/20", iconColor: "text-blue-600 dark:text-blue-400" },
  }

  const txnStatusLabels: Record<string, string> = {
    completed: t("customer.wallet.statusCompleted"),
    pending: t("customer.referrals.pending"),
  }

  if (isLoading || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const balance = summary.balance
  const transactions = summary.transactions
  const paymentMethods = summary.paymentMethods

  // Adding or withdrawing money is a task in its own right — an amount, a
  // method, sometimes a confirmation step. Both were max-w-sm modals floating
  // over the wallet, which on a phone left the method list scrolling inside a
  // small box. They take over the page instead, with a back arrow, and the
  // wallet is still there underneath when the task is done or abandoned.
  if (showAddMoney) {
    return (
      <WalletTaskPanel title={t("customer.wallet.addMoney")} onBack={closeAddMoney}>
        {confirmedAddAmount == null ? (
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-xs font-medium">{t("customer.wallet.amount")}</label>
              <div className="flex gap-2">
                <span className="flex items-center rounded-xl bg-muted px-3 text-xs text-muted-foreground">{currency}</span>
                <Input type="number" placeholder="0" value={addMoneyAmount} onChange={(e) => setAddMoneyAmount(e.target.value)} className="h-12 rounded-xl text-lg" />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[500, 1000, 2000, 5000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAddMoneyAmount(amt.toString())}
                  className={`rounded-xl border py-2.5 text-xs font-semibold transition-colors ${
                    addMoneyAmount === amt.toString() ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {formatMoney(amt)}
                </button>
              ))}
            </div>
            <Button
              className="h-12 w-full rounded-xl"
              onClick={() => { const amt = Number.parseFloat(addMoneyAmount); if (amt > 0) setConfirmedAddAmount(amt) }}
              disabled={!(Number.parseFloat(addMoneyAmount) > 0)}
            >
              {t("customer.wallet.continue")}
            </Button>
          </div>
        ) : (
          <WalletTopupMethods
            amount={confirmedAddAmount}
            onSuccess={() => { handleTopupSuccess(); setTimeout(closeAddMoney, 1500) }}
          />
        )}
      </WalletTaskPanel>
    )
  }

  if (showWithdraw) {
    return (
      <WalletTaskPanel
        title={t("customer.wallet.withdrawMoney")}
        onBack={() => { setShowWithdraw(false); setWithdrawAmount(""); setFormError(""); setWithdrawMethodId(null) }}
      >
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-xs font-medium">{t("customer.wallet.amount")}</label>
            <div className="flex gap-2">
              <span className="flex items-center rounded-xl bg-muted px-3 text-xs text-muted-foreground">{currency}</span>
              <Input type="number" placeholder="0" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="h-12 rounded-xl text-lg" />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{t("customer.wallet.available", { amount: formatMoney(balance) })}</p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium">{t("customer.wallet.withdrawTo")}</label>
            {paymentMethods.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <p className="mb-3 text-[11px] text-muted-foreground">{t("customer.wallet.noMethodSaved")}</p>
                <Button size="sm" variant="outline" className="rounded-lg bg-transparent" onClick={() => { setShowWithdraw(false); setActiveTab("methods"); setShowAddMethod(true) }}>
                  {t("customer.wallet.addPaymentMethod")}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {paymentMethods.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setWithdrawMethodId(m.id)}
                    className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${withdrawMethodId === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${m.type === "mpesa" ? "bg-emerald-100 dark:bg-emerald-900/20" : "bg-blue-100 dark:bg-blue-900/20"}`}>
                      <CreditCard className={`h-4 w-4 ${m.type === "mpesa" ? "text-emerald-600" : "text-blue-600"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground">{m.name}</p>
                      <p className="text-[11px] text-muted-foreground">{m.number}</p>
                    </div>
                    {m.isDefault && <span className="flex-shrink-0 rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{t("customer.wallet.primary")}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {formError && <p className="text-[11px] text-red-600">{formError}</p>}
          <Button className="h-12 w-full rounded-xl" onClick={handleWithdraw} disabled={isSubmitting || !withdrawMethodId}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("customer.wallet.withdraw")}
          </Button>
        </div>
      </WalletTaskPanel>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Wallet className="w-5 h-5 text-primary" />
          <h1 className="text-xl lg:text-2xl font-bold text-foreground tracking-tight">{t("nav.wallet")}</h1>
        </div>

        {returnMessage && (
          <Card className={`p-4 border-0 shadow-sm mb-4 ${returnMessage.type === "success" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
            <p className="text-xs font-medium">{returnMessage.text}</p>
          </Card>
        )}

        {/* Balance Card */}
        <Card className="overflow-hidden border-0 shadow-lg mb-6 bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground">
          <div className="p-6 lg:p-8">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-medium opacity-80">{t("customer.wallet.totalBalance")}</p>
              <button
                onClick={() => setShowBalance(!showBalance)}
                aria-label={showBalance ? t("common.hideBalance") : t("common.showBalance")}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                {showBalance ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold mb-8 tracking-tight">
              {showBalance ? formatMoney(balance) : `${currency} ****`}
            </h2>
            <div className="flex gap-3">
              <Button className="bg-white text-primary hover:bg-white/90 gap-2 shadow-lg rounded-xl h-10" onClick={() => setShowAddMoney(true)}>
                <Plus className="w-4 h-4" /> {t("customer.wallet.addMoney")}
              </Button>
              <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 gap-2 bg-transparent rounded-xl h-10" onClick={openWithdraw}>
                <Minus className="w-4 h-4" /> {t("customer.wallet.withdraw")}
              </Button>
            </div>
          </div>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <Card className="p-4 border-0 shadow-sm min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium mb-1">{t("customer.wallet.totalSpent")}</p>
                <p className="text-lg font-bold text-foreground truncate">{formatMoney(summary.totalSpent)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-primary" /></div>
            </div>
          </Card>
          <Card className="p-4 border-0 shadow-sm min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium mb-1">{t("customer.wallet.escrowHeld")}</p>
                <p className="text-lg font-bold text-foreground truncate">{formatMoney(summary.escrow)}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
            </div>
          </Card>
          <Card className="p-4 border-0 shadow-sm min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium mb-1">{t("customer.wallet.totalServices")}</p>
                <p className="text-lg font-bold text-foreground truncate">{summary.completedServices}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Receipt className="w-5 h-5 text-primary" /></div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl mb-6">
          {([
            { id: "transactions", label: t("customer.wallet.tabTransactions") },
            { id: "escrow", label: t("customer.wallet.tabEscrow") },
            { id: "methods", label: t("customer.wallet.tabMethods") },
          ]).map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-4 text-xs font-medium rounded-lg transition-all ${activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >{tab.label}</button>
          ))}
        </div>

        {/* Transactions */}
        {activeTab === "transactions" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground text-xs">{t("customer.wallet.recentTransactions")}</h3>
              <Button size="sm" variant="ghost" onClick={handleDownloadStatement} className="gap-1.5 text-[11px] h-8" disabled={transactions.length === 0}><Download className="w-3.5 h-3.5" />{t("customer.wallet.export")}</Button>
            </div>
            {transactions.length === 0 ? (
              <Card className="p-8 text-center border-0 shadow-sm">
                <p className="text-xs text-muted-foreground">{t("customer.wallet.noTransactions")}</p>
              </Card>
            ) : transactions.map((txn) => {
              const config = txnConfig[txn.category]
              const Icon = config.icon
              return (
                <Card key={txn.id} className="p-3.5 border-0 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.iconBg}`}>
                      <Icon className={`w-4 h-4 ${config.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-foreground truncate">{txn.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{new Date(txn.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${txn.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"}`}>{txnStatusLabels[txn.status] ?? txn.status}</span>
                      </div>
                    </div>
                    <p className={`font-bold text-xs flex-shrink-0 ${txn.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>
                      {txn.amount > 0 ? "+" : ""}{formatMoney(Math.abs(txn.amount))}
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* Escrow */}
        {activeTab === "escrow" && (
          <div className="space-y-3">
            <Card className="p-4 border-0 shadow-sm bg-sky-50 dark:bg-sky-900/20">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-xs text-sky-900 dark:text-sky-200">{t("customer.wallet.aboutEscrowTitle")}</h4>
                  <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">{t("customer.wallet.aboutEscrowDesc")}</p>
                </div>
              </div>
            </Card>
            {summary.escrowJobs.length === 0 ? (
              <Card className="p-8 text-center border-0 shadow-sm">
                <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <h3 className="mb-1 font-semibold text-foreground text-xs">{t("customer.wallet.noActiveEscrowTitle")}</h3>
                <p className="text-xs text-muted-foreground">{t("customer.wallet.noActiveEscrowDesc")}</p>
              </Card>
            ) : summary.escrowJobs.map((job) => (
              <Card key={job.jobId} className="p-4 border-0 shadow-sm">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h4 className="font-semibold text-xs text-foreground truncate">{job.title}</h4>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${job.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                    {job.status === "IN_PROGRESS" ? (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t("customer.wallet.statusInProgress")}</span>
                    ) : t("customer.wallet.statusAccepted")}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">
                  {t("customer.wallet.providerLabel")} {job.providerName}{job.categoryName ? ` · ${job.categoryName}` : ""}
                </p>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("customer.wallet.amountLabel")}</p>
                  <p className="text-base font-bold text-amber-600 dark:text-amber-400">{formatMoney(job.amount)}</p>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Payment Methods */}
        {activeTab === "methods" && (
          <div className="space-y-3">
            {paymentMethods.length === 0 && (
              <Card className="p-8 text-center border-0 shadow-sm">
                <p className="text-xs text-muted-foreground">{t("customer.wallet.noPaymentMethods")}</p>
              </Card>
            )}
            {paymentMethods.map((method) => (
              <Card key={method.id} className="p-4 border-0 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${method.type === "mpesa" ? "bg-emerald-100 dark:bg-emerald-900/20" : "bg-blue-100 dark:bg-blue-900/20"}`}>
                    <CreditCard className={`w-4 h-4 ${method.type === "mpesa" ? "text-emerald-600" : "text-blue-600"}`} />
                  </div>
                  <div className="flex-1"><p className="font-semibold text-xs text-foreground">{method.name}</p><p className="text-[11px] text-muted-foreground">{method.number}</p></div>
                  {method.isDefault && <span className="px-2.5 py-1 bg-primary/10 text-primary text-[10px] font-semibold rounded-lg">{t("customer.wallet.primary")}</span>}
                </div>
              </Card>
            ))}
            <Button className="w-full rounded-xl mt-2 gap-2" onClick={() => setShowAddMethod(true)}><Plus className="w-4 h-4" />{t("customer.wallet.addPaymentMethod")}</Button>
          </div>
        )}
      </div>

      {/* Add Money Modal */}

      {/* Add Payment Method Modal */}
      <Dialog open={showAddMethod} onOpenChange={(open) => { setShowAddMethod(open); if (!open) setFormError("") }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>{t("customer.wallet.addPaymentMethod")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              {[{ id: "mpesa", label: t("payment.mpesa") }, { id: "card", label: t("customer.wallet.methodCard") }, { id: "paypal", label: t("payment.paypal") }].map((m) => (
                <button key={m.id} onClick={() => setNewMethodType(m.id)} className={`p-3 rounded-xl border-2 transition-all text-center ${newMethodType === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}>
                  <p className="text-[11px] font-semibold">{m.label}</p>
                </button>
              ))}
            </div>
            {newMethodType === "mpesa" && <div><label className="text-xs font-medium mb-1.5 block">{t("customer.wallet.phoneNumber")}</label><Input placeholder="254712345678" value={paymentForm.mpesaPhone} onChange={(e) => setPaymentForm({ ...paymentForm, mpesaPhone: e.target.value })} className="rounded-xl" /></div>}
            {newMethodType === "card" && (
              <div className="space-y-3">
                <div><label className="text-xs font-medium mb-1.5 block">{t("customer.wallet.cardHolder")}</label><Input placeholder={t("customer.wallet.namePlaceholder")} value={paymentForm.cardName} onChange={(e) => setPaymentForm({ ...paymentForm, cardName: e.target.value })} className="rounded-xl" /></div>
                <div><label className="text-xs font-medium mb-1.5 block">{t("customer.wallet.cardNumber")}</label><Input placeholder="4532 1234 5678 9010" value={paymentForm.cardNumber} onChange={(e) => setPaymentForm({ ...paymentForm, cardNumber: e.target.value.replace(/\s/g, "") })} maxLength={16} className="rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-medium mb-1.5 block">{t("customer.wallet.expiry")}</label><Input placeholder="MM/YY" value={paymentForm.expiryDate} onChange={(e) => setPaymentForm({ ...paymentForm, expiryDate: e.target.value })} className="rounded-xl" /></div>
                  <div><label className="text-xs font-medium mb-1.5 block">{t("customer.wallet.cvv")}</label><Input placeholder="123" value={paymentForm.cvv} onChange={(e) => setPaymentForm({ ...paymentForm, cvv: e.target.value })} maxLength={3} className="rounded-xl" /></div>
                </div>
              </div>
            )}
            {newMethodType === "paypal" && <div><label className="text-xs font-medium mb-1.5 block">{t("customer.wallet.paypalEmail")}</label><Input type="email" placeholder="email@example.com" value={paymentForm.paypalEmail} onChange={(e) => setPaymentForm({ ...paymentForm, paypalEmail: e.target.value })} className="rounded-xl" /></div>}
            {formError && <p className="text-[11px] text-red-600">{formError}</p>}
            {newMethodType && (
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 rounded-xl" onClick={handleAddPaymentMethod} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.wallet.add")}</Button>
                <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => { setShowAddMethod(false); setNewMethodType(""); setFormError("") }}>{t("common.cancel")}</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** A wallet task rendered as its own screen: a back arrow, a title, and the
 *  form beneath. Shared by Add money and Withdraw so both read the same. */
function WalletTaskPanel({
  title, onBack, children,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-6 lg:py-8">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={onBack} aria-label="Back" className="rounded-lg p-2 hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
        </div>
        <Card className="border-0 p-5 shadow-sm">{children}</Card>
      </div>
    </div>
  )
}
