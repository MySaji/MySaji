"use client"

import { useEffect, useState } from "react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Megaphone, Plus, Send, Users, Clock, Eye, Trash2, Edit3, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/frontend/components/ui/dialog"
import {
  getAnnouncements, createAnnouncement, sendAnnouncement, deleteAnnouncement,
  type AdminAnnouncement,
} from "@/backend/actions/admin-announcements"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function AdminAnnouncementsPage() {
  const { t, tn } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [newMessage, setNewMessage] = useState("")
  const [newAudience, setNewAudience] = useState("All Users")
  const [filter, setFilter] = useState("all")
  const [isSaving, setIsSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // The values below ("All Users", "Providers", ...) are the literal strings
  // the server contract (lib/actions/admin-announcements.ts AUDIENCE_TO_DB /
  // AUDIENCE_LABEL) expects and returns — only the visible label is
  // translated, the underlying value must stay in English.
  const AUDIENCE_DISPLAY: Record<string, string> = {
    "All Users": t("admin.announcements.audienceAllUsers"),
    "Providers": t("admin.announcements.audienceProviders"),
    "Shopkeepers": t("admin.announcements.audienceShopkeepers"),
    "Distributors": t("admin.announcements.audienceDistributors"),
    "Customers": t("admin.announcements.audienceCustomers"),
    "Agents": t("admin.announcements.audienceAgents"),
    "Internal Team": t("admin.announcements.audienceInternalTeam"),
  }

  const STATUS_LABEL: Record<string, string> = {
    sent: t("admin.announcements.statusSent"),
    scheduled: t("admin.announcements.statusScheduled"),
    draft: t("admin.announcements.statusDraft"),
  }

  const refresh = async () => {
    const data = await getAnnouncements()
    setAnnouncements(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filtered = announcements.filter(a => filter === "all" || a.status === filter)

  const handleCreate = async () => {
    if (!newTitle.trim() || !newMessage.trim()) return
    setIsSaving(true)
    const result = await createAnnouncement({ title: newTitle, message: newMessage, audience: newAudience })
    setIsSaving(false)
    if (!result.success) { alert(result.error); return }
    setNewTitle("")
    setNewMessage("")
    setShowCreate(false)
    await refresh()
  }

  const handleSend = async (id: string) => {
    if (!confirm(t("admin.announcements.confirmSendAnnouncement"))) return
    setBusyId(id)
    const result = await sendAnnouncement({ id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t("admin.announcements.confirmDeleteAnnouncement"))) return
    setBusyId(id)
    const result = await deleteAnnouncement({ id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case "sent": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
      case "scheduled": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
      case "draft": return "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
      default: return "bg-gray-100 text-gray-600"
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("admin.announcements.title")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t("admin.announcements.subtitle")}</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1.5 text-[11px] w-fit"><Plus size={14} />{t("admin.announcements.newAnnouncement")}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("admin.announcements.createTitle")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("admin.announcements.titleLabel")}</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={t("admin.announcements.titlePlaceholder")} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("admin.announcements.messageLabel")}</label>
                <textarea value={newMessage} onChange={e => setNewMessage(e.target.value)} rows={4} placeholder={t("admin.announcements.messagePlaceholder")} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-xs outline-none resize-none focus:ring-2 focus:ring-blue-500/20 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1 block">{t("admin.announcements.targetAudienceLabel")}</label>
                <select value={newAudience} onChange={e => setNewAudience(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-xs outline-none text-gray-900 dark:text-white">
                  <option value="All Users">{AUDIENCE_DISPLAY["All Users"]}</option>
                  <option value="Providers">{AUDIENCE_DISPLAY.Providers}</option>
                  <option value="Shopkeepers">{AUDIENCE_DISPLAY.Shopkeepers}</option>
                  <option value="Distributors">{AUDIENCE_DISPLAY.Distributors}</option>
                  <option value="Customers">{AUDIENCE_DISPLAY.Customers}</option>
                  <option value="Agents">{AUDIENCE_DISPLAY.Agents}</option>
                  <option value="Internal Team">{AUDIENCE_DISPLAY["Internal Team"]}</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={isSaving || !newTitle.trim() || !newMessage.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs">
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{t("admin.announcements.saveAsDraft")}
                </Button>
                <Button variant="outline" onClick={() => setShowCreate(false)} className="text-xs" disabled={isSaving}>{t("common.cancel")}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t("admin.announcements.statTotalSent"), value: announcements.filter(a => a.status === "sent").length.toString(), icon: Send },
          { label: t("admin.announcements.statTotalViews"), value: announcements.reduce((sum, a) => sum + a.views, 0).toLocaleString(), icon: Eye },
          { label: t("admin.announcements.statScheduled"), value: announcements.filter(a => a.status === "scheduled").length.toString(), icon: Clock },
          { label: t("admin.announcements.statDrafts"), value: announcements.filter(a => a.status === "draft").length.toString(), icon: Edit3 },
        ].map((s, i) => (
          <Card key={i} className="p-4">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 w-fit">
        {["all", "sent", "scheduled", "draft"].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${filter === f ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm" : "text-gray-500"}`}>
            {f === "all" ? t("admin.announcements.filterAll") : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <Megaphone size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-xs text-gray-500 dark:text-gray-400">{t("admin.announcements.noAnnouncementsFound")}</p>
          </Card>
        ) : filtered.map(a => {
          const isBusy = busyId === a.id
          return (
            <Card key={a.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${a.status === "sent" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : a.status === "scheduled" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" : "bg-gray-100 dark:bg-gray-700 text-gray-500"}`}>
                  <Megaphone size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-xs font-semibold text-gray-900 dark:text-white">{a.title}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge(a.status)}`}>{STATUS_LABEL[a.status] ?? a.status}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-relaxed line-clamp-2">{a.message}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><Users size={11} />{AUDIENCE_DISPLAY[a.audience] ?? a.audience}</span>
                    <span className="flex items-center gap-1"><Clock size={11} />{a.sentAt ? new Date(a.sentAt).toLocaleDateString() : "-"}</span>
                    {a.views > 0 && <span className="flex items-center gap-1"><Eye size={11} />{tn("admin.announcements.viewsCount", a.views, { formatted: a.views.toLocaleString() })}</span>}
                  </div>
                </div>
                <div className="flex sm:flex-col gap-2 flex-shrink-0">
                  {a.status !== "sent" && (
                    <Button size="sm" onClick={() => handleSend(a.id)} disabled={isBusy} className="gap-1 text-[11px] bg-blue-600 hover:bg-blue-700">
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}{t("admin.announcements.sendNow")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleDelete(a.id)} disabled={isBusy} className="gap-1 text-[11px] text-red-600 border-red-200 hover:bg-red-50"><Trash2 size={12} /></Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
