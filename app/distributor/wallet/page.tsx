"use client"

import { useEffect, useState } from "react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { getDistributorWalletSummary, type DistributorWalletSummary } from "@/lib/actions/distributor-wallet"
import { requestWithdrawal, addPaymentMethod } from "@/lib/actions/wallet"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Plus, Eye, EyeOff, CreditCard, TrendingUp, Minus, Download, ArrowUpRight, ArrowDownLeft, Wallet, Clock, Loader2,
} from "lucide-react"

export default function DistributorWalletPage() {
  const { t, formatMoney, currency } = useLocalization()
  const [showBalance, setShowBalance] = useState(true)
  const [activeTab, setActiveTab] = useState("transactions")
  const [showAddMethod, setShowAddMethod] = useState(false)
  const [newMethodType, setNewMethodType] = useState("")
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawMethodId, setWithdrawMethodId] = useState<string | null>(null)
  const [paymentForm, setPaymentForm] = useState({ mpesaPhone: "", cardNumber: "", cardName: "", expiryDate: "", cvv: "", paypalEmail: "" })

  const [summary, setSummary] = useState<DistributorWalletSummary>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = () => getDistributorWalletSummary().then(setSummary)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleWithdraw = async () => {
    const amount = Number.parseFloat(withdrawAmount)
    if (!(amount > 0) || !withdrawMethodId) return
    setIsSubmitting(true)
    setFormError("")
    const result = await requestWithdrawal({ amount, paymentMethodId: withdrawMethodId })
    setIsSubmitting(false)
    if (!result.success) { setFormError(result.error); return }
    await refresh()
    setShowWithdraw(false); setWithdrawAmount(""); setWithdrawMethodId(null)
  }

  const openWithdraw = () => {
    setWithdrawMethodId(summary?.paymentMethods.find((m) => m.isDefault)?.id ?? summary?.paymentMethods[0]?.id ?? null)
    setShowWithdraw(true)
  }

  const handleDownloadStatement = () => {
    if (!summary) return
    const headers = [t("distributor.wallet.csvDate"), t("distributor.wallet.csvType"), t("distributor.wallet.csvDescription"), t("distributor.wallet.csvAmount"), t("common.status")]
    const rows = summary.transactions.map((tx) => [new Date(tx.date).toLocaleDateString(), tx.type, tx.description, formatMoney(tx.amount), tx.status])
    const csv = [[t("distributor.wallet.csvTitle")], [t("distributor.wallet.csvBalance", { amount: formatMoney(summary.balance) })], [], headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `distributor-wallet-statement-${new Date().toISOString().split('T')[0]}.csv`; link.click()
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
    if (!result.success) { setFormError(result.error); return }
    await refresh()
    setShowAddMethod(false)
    setPaymentForm({ mpesaPhone: "", cardNumber: "", cardName: "", expiryDate: "", cvv: "", paypalEmail: "" }); setNewMethodType("")
  }

  const txnConfig: Record<string, { icon: typeof ArrowUpRight; iconBg: string; iconColor: string }> = {
    credit: { icon: ArrowDownLeft, iconBg: "bg-emerald-100 dark:bg-emerald-900/20", iconColor: "text-emerald-600 dark:text-emerald-400" },
    debit: { icon: ArrowUpRight, iconBg: "bg-amber-100 dark:bg-amber-900/20", iconColor: "text-amber-600 dark:text-amber-400" },
  }

  if (isLoading || !summary) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const { balance, transactions, paymentMethods } = summary

  return (
    <div className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 py-6 lg:py-8">
        <div className="flex items-center gap-2 mb-6">
          <Wallet className="w-5 h-5 text-teal-600" />
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">{t("distributor.wallet.title")}</h1>
        </div>

        <Card className="overflow-hidden border-0 shadow-lg mb-6 bg-gradient-to-br from-teal-700 via-teal-700 to-cyan-900 text-white">
          <div className="p-6 lg:p-8">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-medium opacity-80">{t("distributor.wallet.totalBalance")}</p>
              <button onClick={() => setShowBalance(!showBalance)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                {showBalance ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
              </button>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-8 tracking-tight break-words">
              {showBalance ? formatMoney(balance) : `${currency} ****`}
            </h2>
            <div className="flex gap-3">
              <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 gap-2 bg-transparent rounded-xl h-10" onClick={openWithdraw}>
                <Minus className="w-4 h-4" /> {t("distributor.wallet.withdraw")}
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
          <Card className="p-2.5 sm:p-4 border-0 shadow-sm min-w-0">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/20 flex items-center justify-center flex-shrink-0"><TrendingUp className="w-5 h-5 text-teal-600" /></div>
              <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{t("distributor.wallet.totalEarnings")}</p>
              <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">{formatMoney(summary.totalEarnings)}</p>
            </div>
          </Card>
          <Card className="p-2.5 sm:p-4 border-0 shadow-sm min-w-0">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/20 flex items-center justify-center flex-shrink-0"><TrendingUp className="w-5 h-5 text-teal-600" /></div>
              <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{t("distributor.wallet.thisMonth")}</p>
              <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">{formatMoney(summary.thisMonth)}</p>
            </div>
          </Card>
          <Card className="p-2.5 sm:p-4 border-0 shadow-sm min-w-0">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0"><Clock className="w-5 h-5 text-amber-600" /></div>
              <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{t("distributor.wallet.pending")}</p>
              <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">{formatMoney(summary.pending)}</p>
            </div>
          </Card>
        </div>

        <div className="flex gap-1 p-1 bg-muted/50 rounded-xl mb-6">
          {([{ id: "transactions", label: t("distributor.wallet.tabTransactions") }, { id: "methods", label: t("distributor.wallet.tabMethods") }]).map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-4 text-xs font-medium rounded-lg transition-all ${activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >{tab.label}</button>
          ))}
        </div>

        {activeTab === "transactions" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-white text-xs">{t("distributor.wallet.recentTransactions")}</h3>
              <Button size="sm" variant="ghost" onClick={handleDownloadStatement} className="gap-1.5 text-[11px] h-8" disabled={transactions.length === 0}><Download className="w-3.5 h-3.5" />{t("distributor.wallet.export")}</Button>
            </div>
            {transactions.length === 0 ? (
              <Card className="p-8 text-center border-0 shadow-sm">
                <p className="text-xs text-muted-foreground">{t("distributor.wallet.noTransactions")}</p>
              </Card>
            ) : transactions.map((txn) => {
              const config = txnConfig[txn.type]
              const Icon = config.icon
              return (
                <Card key={txn.id} className="p-3.5 border-0 shadow-sm hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.iconBg}`}>
                      <Icon className={`w-4 h-4 ${config.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-gray-900 dark:text-white truncate">{txn.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{new Date(txn.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${txn.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"}`}>{txn.status === "completed" ? t("distributor.wallet.statusCompleted") : t("distributor.wallet.statusPending")}</span>
                      </div>
                    </div>
                    <p className={`font-bold text-xs flex-shrink-0 ${txn.type === "credit" ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-white"}`}>
                      {txn.type === "credit" ? "+" : "-"}{formatMoney(txn.amount)}
                    </p>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {activeTab === "methods" && (
          <div className="space-y-3">
            {paymentMethods.length === 0 && (
              <Card className="p-8 text-center border-0 shadow-sm">
                <p className="text-xs text-muted-foreground">{t("distributor.wallet.noPaymentMethods")}</p>
              </Card>
            )}
            {paymentMethods.map((method) => (
              <Card key={method.id} className="p-4 border-0 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${method.type === "mpesa" ? "bg-emerald-100 dark:bg-emerald-900/20" : "bg-blue-100 dark:bg-blue-900/20"}`}>
                    <CreditCard className={`w-4 h-4 ${method.type === "mpesa" ? "text-emerald-600" : "text-blue-600"}`} />
                  </div>
                  <div className="flex-1"><p className="font-semibold text-xs text-gray-900 dark:text-white">{method.name}</p><p className="text-[11px] text-muted-foreground">{method.number}</p></div>
                  {method.isDefault && <span className="px-2.5 py-1 bg-teal-100 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-[10px] font-semibold rounded-lg">{t("distributor.wallet.primary")}</span>}
                </div>
              </Card>
            ))}
            <Button className="w-full rounded-xl mt-2 gap-2 bg-teal-600 hover:bg-teal-700" onClick={() => setShowAddMethod(true)}><Plus className="w-4 h-4" />{t("distributor.wallet.addPaymentMethod")}</Button>
          </div>
        )}
      </div>

      <Dialog open={showWithdraw} onOpenChange={(open) => { setShowWithdraw(open); if (!open) { setFormError(""); setWithdrawMethodId(null) } }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>{t("distributor.wallet.withdrawMoney")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium mb-2 block">{t("distributor.wallet.amount")}</label>
              <div className="flex gap-2"><span className="flex items-center px-3 bg-muted rounded-xl text-xs text-muted-foreground">{currency}</span><Input type="number" placeholder="0" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} className="rounded-xl" /></div>
            </div>
            <p className="text-[11px] text-muted-foreground">{t("distributor.wallet.available", { amount: formatMoney(balance) })}</p>

            <div>
              <label className="text-xs font-medium mb-2 block">{t("distributor.wallet.withdrawTo")}</label>
              {paymentMethods.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center">
                  <p className="text-[11px] text-muted-foreground mb-2">{t("distributor.wallet.noMethodSaved")}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg bg-transparent"
                    onClick={() => { setShowWithdraw(false); setActiveTab("methods"); setShowAddMethod(true) }}
                  >
                    {t("distributor.wallet.addPaymentMethod")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {paymentMethods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setWithdrawMethodId(m.id)}
                      className={`w-full flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all ${withdrawMethodId === m.id ? "border-teal-600 bg-teal-50 dark:bg-teal-900/10" : "border-border hover:border-teal-400"}`}
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${m.type === "mpesa" ? "bg-emerald-100 dark:bg-emerald-900/20" : "bg-blue-100 dark:bg-blue-900/20"}`}>
                        <CreditCard className={`w-4 h-4 ${m.type === "mpesa" ? "text-emerald-600" : "text-blue-600"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{m.name}</p>
                        <p className="text-[11px] text-muted-foreground">{m.number}</p>
                      </div>
                      {m.isDefault && <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 text-[10px] font-semibold rounded-lg flex-shrink-0">{t("distributor.wallet.primary")}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {formError && <p className="text-[11px] text-red-600">{formError}</p>}
            <div className="flex gap-2">
              <Button className="flex-1 rounded-xl bg-teal-600 hover:bg-teal-700" onClick={handleWithdraw} disabled={isSubmitting || !withdrawMethodId}>{isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("distributor.wallet.withdraw")}</Button>
              <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => { setShowWithdraw(false); setWithdrawAmount(""); setFormError(""); setWithdrawMethodId(null) }}>{t("common.cancel")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddMethod} onOpenChange={(open) => { setShowAddMethod(open); if (!open) setFormError("") }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>{t("distributor.wallet.addPaymentMethod")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              {[{ id: "mpesa", label: t("payment.mpesa") }, { id: "card", label: t("distributor.wallet.methodCard") }, { id: "paypal", label: t("payment.paypal") }].map((m) => (
                <button key={m.id} onClick={() => setNewMethodType(m.id)} className={`p-3 rounded-xl border-2 transition-all text-center ${newMethodType === m.id ? "border-teal-600 bg-teal-50 dark:bg-teal-900/10" : "border-border hover:border-teal-400"}`}>
                  <p className="text-[11px] font-semibold">{m.label}</p>
                </button>
              ))}
            </div>
            {newMethodType === "mpesa" && <div><label className="text-xs font-medium mb-1.5 block">{t("distributor.wallet.phoneNumber")}</label><Input placeholder="254712345678" value={paymentForm.mpesaPhone} onChange={(e) => setPaymentForm({ ...paymentForm, mpesaPhone: e.target.value })} className="rounded-xl" /></div>}
            {newMethodType === "card" && (
              <div className="space-y-3">
                <div><label className="text-xs font-medium mb-1.5 block">{t("distributor.wallet.cardHolder")}</label><Input placeholder={t("distributor.wallet.namePlaceholder")} value={paymentForm.cardName} onChange={(e) => setPaymentForm({ ...paymentForm, cardName: e.target.value })} className="rounded-xl" /></div>
                <div><label className="text-xs font-medium mb-1.5 block">{t("distributor.wallet.cardNumber")}</label><Input placeholder="4532 1234 5678 9010" value={paymentForm.cardNumber} onChange={(e) => setPaymentForm({ ...paymentForm, cardNumber: e.target.value.replace(/\s/g, "") })} maxLength={16} className="rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-medium mb-1.5 block">{t("distributor.wallet.expiry")}</label><Input placeholder="MM/YY" value={paymentForm.expiryDate} onChange={(e) => setPaymentForm({ ...paymentForm, expiryDate: e.target.value })} className="rounded-xl" /></div>
                  <div><label className="text-xs font-medium mb-1.5 block">{t("distributor.wallet.cvv")}</label><Input placeholder="123" value={paymentForm.cvv} onChange={(e) => setPaymentForm({ ...paymentForm, cvv: e.target.value })} maxLength={3} className="rounded-xl" /></div>
                </div>
              </div>
            )}
            {newMethodType === "paypal" && <div><label className="text-xs font-medium mb-1.5 block">{t("distributor.wallet.paypalEmail")}</label><Input type="email" placeholder="email@example.com" value={paymentForm.paypalEmail} onChange={(e) => setPaymentForm({ ...paymentForm, paypalEmail: e.target.value })} className="rounded-xl" /></div>}
            {formError && <p className="text-[11px] text-red-600">{formError}</p>}
            {newMethodType && (
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 rounded-xl bg-teal-600 hover:bg-teal-700" onClick={handleAddPaymentMethod} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("distributor.wallet.add")}</Button>
                <Button variant="outline" className="flex-1 rounded-xl bg-transparent" onClick={() => { setShowAddMethod(false); setNewMethodType(""); setFormError("") }}>{t("common.cancel")}</Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
