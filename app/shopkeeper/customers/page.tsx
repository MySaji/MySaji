"use client"

import { useEffect, useState } from "react"
import { Search, Phone, Calendar, DollarSign, ChevronRight, Users, RefreshCw, Loader2, Ban, ShieldCheck } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getShopCustomers, blockShopCustomer, unblockShopCustomer, type ShopCustomer } from "@/lib/actions/shopkeeper-customers"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ShopkeeperCustomersPage() {
  const { t, tn, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [customers, setCustomers] = useState<ShopCustomer[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState("All")
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  const [blockTargetId, setBlockTargetId] = useState<string | null>(null)
  const [blockReason, setBlockReason] = useState("")
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false)

  const refresh = () => getShopCustomers().then(setCustomers)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filtered = customers
    .filter((c) => filterType === "All" || (filterType === "Repeat" && c.totalOrders >= 2) || (filterType === "Blocked" && c.isBlocked))
    .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const openBlockDialog = (customerId: string) => {
    setBlockTargetId(customerId)
    setBlockReason("")
  }

  const confirmBlock = async () => {
    if (!blockTargetId) return
    setIsSubmittingBlock(true)
    await blockShopCustomer({ customerId: blockTargetId, reason: blockReason.trim() || undefined })
    setIsSubmittingBlock(false)
    setBlockTargetId(null)
    await refresh()
  }

  const handleUnblock = async (customerId: string) => {
    setCustomers((prev) => prev.map((c) => (c.id === customerId ? { ...c, isBlocked: false, blockedReason: null } : c)))
    await unblockShopCustomer({ customerId })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("shopkeeper.customers.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("shopkeeper.customers.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 border border-border rounded-xl text-center">
          <Users className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground">{customers.length}</p>
          <p className="text-[10px] text-muted-foreground">{t("shopkeeper.customers.statTotal")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <RefreshCw className="w-4 h-4 text-accent mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground">{customers.filter((c) => c.totalOrders >= 2).length}</p>
          <p className="text-[10px] text-muted-foreground">{t("shopkeeper.customers.statRepeat")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <DollarSign className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground">{formatMoney(customers.reduce((a, c) => a + c.totalSpent, 0))}</p>
          <p className="text-[10px] text-muted-foreground">{t("shopkeeper.customers.statRevenue")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center">
          <Ban className="w-4 h-4 text-destructive mx-auto mb-1" />
          <p className="text-xl font-bold text-foreground">{customers.filter((c) => c.isBlocked).length}</p>
          <p className="text-[10px] text-muted-foreground">{t("shopkeeper.customers.statBlocked")}</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("shopkeeper.customers.searchPlaceholder")} className="pl-9 rounded-xl bg-card border-border" />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: "All", label: t("shopkeeper.customers.filterAll") },
            { key: "Repeat", label: t("shopkeeper.customers.filterRepeat") },
            { key: "Blocked", label: t("shopkeeper.customers.filterBlocked") },
          ].map((f) => (
            <button key={f.key} onClick={() => setFilterType(f.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterType === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-sm text-muted-foreground">{t("shopkeeper.customers.emptyText")}</p>
          </Card>
        )}
        {filtered.map((customer) => (
          <Card key={customer.id} className="border border-border rounded-xl overflow-hidden">
            <button onClick={() => setExpandedCustomer(expandedCustomer === customer.id ? null : customer.id)} className="w-full p-4 text-left">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">{customer.name.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{customer.name}</span>
                    {customer.isBlocked && <Ban className="w-3 h-3 text-destructive flex-shrink-0" />}
                    {customer.totalOrders >= 2 && <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">{t("shopkeeper.customers.repeatBadge")}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t("shopkeeper.customers.customerSince", { date: new Date(customer.customerSince).toLocaleDateString() })}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-foreground">{formatMoney(customer.totalSpent)}</p>
                  <p className="text-[10px] text-muted-foreground">{tn("shopkeeper.customers.ordersCount", customer.totalOrders)}</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCustomer === customer.id ? "rotate-90" : ""}`} />
              </div>
            </button>
            {expandedCustomer === customer.id && (
              <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{customer.phone ?? t("shopkeeper.customers.noPhoneOnFile")}</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t("shopkeeper.customers.lastOrder", { date: new Date(customer.lastOrderDate).toLocaleDateString() })}</span>
                </div>
                {customer.isBlocked && customer.blockedReason && (
                  <div className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                    <strong>{t("shopkeeper.customers.blockedReasonLabel")}</strong> {customer.blockedReason}
                  </div>
                )}
                {customer.orders.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{t("shopkeeper.customers.recentOrdersLabel")}</p>
                    {customer.orders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <div>
                          <p className="text-xs font-medium text-foreground">{order.orderNumber}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(order.date).toLocaleDateString()}</p>
                        </div>
                        <p className="text-xs font-semibold text-foreground">{formatMoney(order.amount)}</p>
                      </div>
                    ))}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className={`w-full rounded-lg text-xs ${customer.isBlocked ? "" : "text-destructive hover:text-destructive"}`}
                  onClick={() => (customer.isBlocked ? handleUnblock(customer.id) : openBlockDialog(customer.id))}
                >
                  {customer.isBlocked ? <ShieldCheck className="w-3 h-3 mr-1" /> : <Ban className="w-3 h-3 mr-1" />}
                  {customer.isBlocked ? t("shopkeeper.customers.unblock") : t("shopkeeper.customers.block")}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={blockTargetId !== null} onOpenChange={(open) => !open && setBlockTargetId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("shopkeeper.customers.blockDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">{t("shopkeeper.customers.blockDialogHint")}</p>
            <Textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              placeholder={t("shopkeeper.customers.blockReasonPlaceholder")}
              className="min-h-[80px] resize-none"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setBlockTargetId(null)} disabled={isSubmittingBlock}>
                {t("common.cancel")}
              </Button>
              <Button variant="destructive" className="flex-1" onClick={confirmBlock} disabled={isSubmittingBlock}>
                {isSubmittingBlock ? <Loader2 className="w-4 h-4 animate-spin" /> : t("shopkeeper.customers.confirmBlock")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
