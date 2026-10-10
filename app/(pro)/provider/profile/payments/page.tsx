"use client"

import { ArrowLeft, CreditCard, Plus, Trash2, Edit2, Check, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import {
  getWalletSummary, addPaymentMethod, removePaymentMethod, setDefaultPaymentMethod, updatePaymentMethod,
  type WalletPaymentMethod,
} from "@/backend/actions/wallet"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { useGatedAction } from "@/frontend/lib/hooks/useGatedAction"
import type { TranslationKey } from "@/backend/domain/i18n"

const TYPE_LABEL_KEY: Record<string, TranslationKey> = {
  mpesa: "payment.mpesa", airtel: "provider.payments.typeAirtelMoney", card: "provider.payments.typeCard",
  paypal: "payment.paypal", bank: "provider.payments.typeBankAccount",
}

export default function PaymentMethodsPage() {
  const { handleGateFailure } = useGatedAction()
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [payments, setPayments] = useState<WalletPaymentMethod[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState<WalletPaymentMethod | null>(null)
  const [newMethodType, setNewMethodType] = useState<"mpesa" | "airtel" | "bank" | "card">("mpesa")
  const [newMethodDetails, setNewMethodDetails] = useState("")
  const [methodError, setMethodError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const refresh = () => getWalletSummary().then((data) => setPayments(data?.paymentMethods ?? []))

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleAddMethod = async () => {
    setMethodError("")
    if (!newMethodDetails.trim()) { setMethodError(t("provider.payments.detailsRequiredError")); return }

    setIsSaving(true)
    const payload =
      newMethodType === "mpesa" || newMethodType === "airtel" ? { type: newMethodType, mpesaPhone: newMethodDetails } :
      newMethodType === "bank" ? { type: newMethodType, bankDetails: newMethodDetails } :
      { type: newMethodType, cardNumber: newMethodDetails, cvv: "000" }
    const result = await addPaymentMethod(payload)
    setIsSaving(false)
    if (!result.success) {
      // A verification refusal opens the wizard rather than leaving the user
      // with a message and nowhere to act on it. updatePaymentMethod below is
      // deliberately not gated — editing an existing destination is not the
      // step that needs checking.
      if (handleGateFailure(result)) return
      setMethodError(result.error)
      return
    }

    setShowAddModal(false)
    setNewMethodDetails("")
    await refresh()
  }

  const handleEditMethod = async () => {
    setMethodError("")
    if (!newMethodDetails.trim() || !editingPayment) { setMethodError(t("provider.payments.detailsRequiredError")); return }

    setIsSaving(true)
    const result = await updatePaymentMethod({ id: editingPayment.id, details: newMethodDetails })
    setIsSaving(false)
    if (!result.success) { setMethodError(result.error); return }

    setShowEditModal(false)
    setEditingPayment(null)
    setNewMethodDetails("")
    await refresh()
  }

  const handleEditClick = (payment: WalletPaymentMethod) => {
    setEditingPayment(payment)
    setNewMethodDetails("")
    setMethodError("")
    setShowEditModal(true)
  }

  const removePayment = async (id: string) => {
    if (!confirm(t("provider.payments.deleteConfirm"))) return
    setPayments((prev) => prev.filter((p) => p.id !== id))
    await removePaymentMethod({ id })
  }

  const setPrimary = async (id: string) => {
    setPayments((prev) => prev.map((p) => ({ ...p, isDefault: p.id === id })))
    await setDefaultPaymentMethod({ id })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 lg:pb-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white p-4">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/provider/profile" className="lg:hidden hover:bg-blue-500/50 p-2 rounded-lg">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <h1 className="text-lg font-bold">{t("provider.payments.title")}</h1>
          </div>
          <Button onClick={() => { setNewMethodDetails(""); setMethodError(""); setShowAddModal(true) }} className="bg-white text-blue-600 hover:bg-gray-100">
            <Plus className="w-4 h-4 mr-2" />{t("provider.payments.addMethod")}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-w-2xl mx-auto lg:max-w-4xl space-y-6 py-6">
        {payments.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg">
            <CreditCard className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-white font-medium mb-2">{t("provider.payments.noMethodsTitle")}</p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-6">{t("provider.payments.noMethodsDesc")}</p>
            <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 mr-2" />{t("provider.payments.addFirstMethod")}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => (
              <div key={payment.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-white">{payment.name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{payment.number}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {payment.isDefault ? (
                    <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[11px] px-3 py-1 rounded-full font-medium">{t("provider.payments.primaryBadge")}</span>
                  ) : (
                    <button onClick={() => setPrimary(payment.id)} className="text-[11px] px-3 py-1 rounded-full border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">{t("provider.payments.setAsPrimary")}</button>
                  )}
                  <button onClick={() => handleEditClick(payment)} aria-label={t("common.edit")} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Edit2 className="w-4 h-4 text-blue-600 dark:text-blue-400" /></button>
                  <button onClick={() => removePayment(payment.id)} aria-label={t("common.delete")} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Payment Method Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("provider.payments.addMethodModalTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">{t("provider.payments.methodTypeLabel")}</label>
              <select value={newMethodType} onChange={(e) => setNewMethodType(e.target.value as typeof newMethodType)} className="w-full p-3 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="mpesa">{t("payment.mpesa")}</option>
                <option value="airtel">{t("provider.payments.typeAirtelMoney")}</option>
                <option value="bank">{t("provider.payments.typeBankAccount")}</option>
                <option value="card">{t("provider.payments.typeCard")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">{newMethodType === "mpesa" || newMethodType === "airtel" ? t("provider.payments.phoneNumberLabel") : newMethodType === "card" ? t("provider.payments.cardNumberLabel") : t("provider.payments.accountDetailsLabel")}</label>
              <Input value={newMethodDetails} onChange={(e) => setNewMethodDetails(e.target.value)} placeholder={newMethodType === "mpesa" || newMethodType === "airtel" ? t("provider.payments.phonePlaceholder") : newMethodType === "card" ? t("provider.payments.cardNumberPlaceholder") : t("provider.payments.accountDetailsPlaceholder")} />
            </div>
            {methodError && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs">{methodError}</div>}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowAddModal(false)} className="flex-1 bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleAddMethod} className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-2" />{t("provider.payments.addMethod")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Method Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{t("provider.payments.editMethodTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">{t("provider.payments.methodTypeLabel")}</label>
              <p className="text-xs text-muted-foreground p-2 bg-muted rounded">{editingPayment && (TYPE_LABEL_KEY[editingPayment.type] ? t(TYPE_LABEL_KEY[editingPayment.type]) : editingPayment.name)}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-2">{t("provider.payments.newAccountDetailsLabel")}</label>
              <Input value={newMethodDetails} onChange={(e) => setNewMethodDetails(e.target.value)} placeholder={t("provider.payments.enterUpdatedDetailsPlaceholder")} />
            </div>
            {methodError && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-xs">{methodError}</div>}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => { setShowEditModal(false); setEditingPayment(null) }} className="flex-1 bg-transparent" disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleEditMethod} className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4 mr-2" />{t("provider.payments.updateMethod")}</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
