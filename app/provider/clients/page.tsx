"use client"

import { useEffect, useState } from "react"
import { Search, Phone, MessageCircle, Star, MapPin, Calendar, DollarSign, ChevronRight, Users, Heart, RefreshCw, Loader2, Ban, ShieldCheck } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getProviderClients, toggleFavoriteClient, blockClient, unblockClient, type ProviderClient } from "@/lib/actions/provider-clients"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ClientsPage() {
  const { t, tn, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [clients, setClients] = useState<ProviderClient[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState("All")
  const [expandedClient, setExpandedClient] = useState<string | null>(null)

  useEffect(() => {
    getProviderClients().then(setClients).finally(() => setIsLoading(false))
  }, [])

  const filtered = clients
    .filter(c => filterType === "All" || (filterType === "Favorites" && c.isFavorite) || (filterType === "Repeat" && c.totalJobs >= 3) || (filterType === "Blocked" && c.isBlocked))
    .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => b.totalSpent - a.totalSpent)

  const toggleFavorite = async (id: string) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c))
    await toggleFavoriteClient({ clientId: id })
  }

  const toggleBlock = async (id: string, currentlyBlocked: boolean) => {
    if (currentlyBlocked) {
      setClients(prev => prev.map(c => c.id === id ? { ...c, isBlocked: false } : c))
      await unblockClient({ clientId: id })
    } else {
      if (!window.confirm(t("provider.clients.blockConfirm"))) return
      setClients(prev => prev.map(c => c.id === id ? { ...c, isBlocked: true } : c))
      await blockClient({ clientId: id })
    }
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
        <h1 className="text-2xl font-bold text-foreground">{t("provider.clients.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("provider.clients.subtitle")}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 border border-border rounded-xl text-center min-w-0">
          <Users className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">{clients.length}</p>
          <p className="text-[10px] text-muted-foreground">{t("provider.clients.statTotalClients")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center min-w-0">
          <RefreshCw className="w-4 h-4 text-accent mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">{clients.filter(c => c.totalJobs >= 3).length}</p>
          <p className="text-[10px] text-muted-foreground">{t("provider.clients.statRepeatClients")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center min-w-0">
          <DollarSign className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">{formatMoney(clients.reduce((a, c) => a + c.totalSpent, 0))}</p>
          <p className="text-[10px] text-muted-foreground">{t("provider.clients.statTotalRevenue")}</p>
        </Card>
        <Card className="p-3 border border-border rounded-xl text-center min-w-0">
          <Star className="w-4 h-4 text-amber-500 mx-auto mb-1" />
          <p className="text-lg sm:text-xl font-bold text-foreground truncate">{clients.length > 0 ? (clients.reduce((a, c) => a + c.avgRating, 0) / clients.length).toFixed(1) : "0.0"}</p>
          <p className="text-[10px] text-muted-foreground">{t("provider.clients.statAvgRating")}</p>
        </Card>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("provider.clients.searchPlaceholder")} className="pl-9 rounded-xl bg-card border-border" />
        </div>
        <div className="flex gap-1.5">
          {[
            { key: "All", label: t("provider.clients.filterAll") },
            { key: "Favorites", label: t("provider.clients.filterFavorites") },
            { key: "Repeat", label: t("provider.clients.filterRepeat") },
            { key: "Blocked", label: t("provider.clients.filterBlocked") },
          ].map(f => (
            <button key={f.key} onClick={() => setFilterType(f.key)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${filterType === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Client List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <Card className="p-10 text-center border-dashed">
            <p className="text-sm text-muted-foreground">{t("provider.clients.emptyText")}</p>
          </Card>
        )}
        {filtered.map(client => (
          <Card key={client.id} className="border border-border rounded-xl overflow-hidden">
            <button onClick={() => setExpandedClient(expandedClient === client.id ? null : client.id)} className="w-full p-4 text-left">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">{client.name.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{client.name}</span>
                    {client.isFavorite && <Heart className="w-3 h-3 text-red-500 fill-current flex-shrink-0" />}
                    {client.isBlocked && <Ban className="w-3 h-3 text-destructive flex-shrink-0" />}
                    {client.totalJobs >= 3 && <span className="text-[9px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">{t("provider.clients.repeatBadge")}</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{client.location}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-foreground">{formatMoney(client.totalSpent)}</p>
                  <p className="text-[10px] text-muted-foreground">{tn("provider.clients.jobsCount", client.totalJobs)}</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedClient === client.id ? "rotate-90" : ""}`} />
              </div>
            </button>
            {expandedClient === client.id && (
              <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{client.phone ?? t("provider.clients.noPhoneOnFile")}</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{t("provider.clients.clientSince", { date: new Date(client.clientSince).toLocaleDateString() })}</span>
                  {client.avgRating > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" />{client.avgRating.toFixed(1)}</span>}
                </div>
                {client.jobs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{t("provider.clients.recentJobsLabel")}</p>
                    {client.jobs.map(job => (
                      <div key={job.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg">
                        <div>
                          <p className="text-xs font-medium text-foreground">{job.service}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(job.date).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-foreground">{formatMoney(job.amount)}</p>
                          {job.rating != null && <div className="flex items-center gap-0.5 justify-end"><Star className="w-2.5 h-2.5 text-amber-500 fill-current" /><span className="text-[10px] text-muted-foreground">{job.rating}</span></div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleFavorite(client.id)} className="flex-1 rounded-lg text-xs">
                    <Heart className={`w-3 h-3 mr-1 ${client.isFavorite ? "fill-red-500 text-red-500" : ""}`} />
                    {client.isFavorite ? t("provider.clients.unfavorite") : t("provider.clients.favorite")}
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 rounded-lg text-xs" onClick={() => { window.location.href = `/provider/messages?client=${client.id}&action=message` }}>
                    <MessageCircle className="w-3 h-3 mr-1" />{t("provider.clients.messageButton")}
                  </Button>
                  <Button size="sm" className="flex-1 rounded-lg text-xs" disabled={!client.phone} onClick={() => { if (client.phone) window.location.href = `tel:${client.phone}` }}>
                    <Phone className="w-3 h-3 mr-1" />{t("provider.clients.callButton")}
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className={`w-full rounded-lg text-xs ${client.isBlocked ? "" : "text-destructive hover:text-destructive"}`}
                  onClick={() => toggleBlock(client.id, client.isBlocked)}
                >
                  {client.isBlocked ? <ShieldCheck className="w-3 h-3 mr-1" /> : <Ban className="w-3 h-3 mr-1" />}
                  {client.isBlocked ? t("provider.clients.unblock") : t("provider.clients.block")}
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
