"use client"

import { useEffect, useState } from "react"
import { Search, Eye, AlertCircle, Loader2 } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import { getSubAdminUsers, toggleSuspendUser, type SubAdminUserRow } from "@/backend/actions/sub-admin-users"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function SubAdminUsersPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState<SubAdminUserRow[]>([])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("All")
  const [selected, setSelected] = useState<SubAdminUserRow | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    const data = await getSubAdminUsers()
    setUsers(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filters = ["All", "Active", "Pending", "Disputed", "Suspended"]
  const filterLabels: Record<string, string> = {
    All: t("subAdmin.users.filterAll"),
    Active: t("subAdmin.users.statusActive"),
    Pending: t("subAdmin.users.statusPending"),
    Disputed: t("subAdmin.users.statusDisputed"),
    Suspended: t("subAdmin.users.statusSuspended"),
  }
  const statusLabels: Record<string, string> = {
    active: t("subAdmin.users.statusActive"),
    pending: t("subAdmin.users.statusPending"),
    disputed: t("subAdmin.users.statusDisputed"),
    suspended: t("subAdmin.users.statusSuspended"),
  }
  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === "All" || u.status === filter.toLowerCase()
    return matchSearch && matchFilter
  })

  const getStatusColor = (s: string) => {
    if (s === "active") return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
    if (s === "pending") return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
    if (s === "disputed") return "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
    return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
  }

  const handleSuspend = async (id: string) => {
    setBusyId(id)
    const result = await toggleSuspendUser({ userId: id })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
    setShowModal(false)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">{t("subAdmin.users.title")}</h1>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t("subAdmin.users.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 border-0 shadow-sm"><p className="text-[11px] text-gray-500">{t("subAdmin.users.statTotal")}</p><p className="text-lg font-bold text-gray-900 dark:text-white">{users.length}</p></Card>
        <Card className="p-3 border-0 shadow-sm"><p className="text-[11px] text-gray-500">{t("subAdmin.users.statusActive")}</p><p className="text-lg font-bold text-emerald-600">{users.filter(u=>u.status==="active").length}</p></Card>
        <Card className="p-3 border-0 shadow-sm"><p className="text-[11px] text-gray-500">{t("subAdmin.users.statusPending")}</p><p className="text-lg font-bold text-amber-600">{users.filter(u=>u.status==="pending").length}</p></Card>
        <Card className="p-3 border-0 shadow-sm"><p className="text-[11px] text-gray-500">{t("subAdmin.users.statusSuspended")}</p><p className="text-lg font-bold text-red-600">{users.filter(u=>u.status==="suspended").length}</p></Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("subAdmin.users.searchPlaceholder")} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {filters.map(f => (
            <button key={f} onClick={()=>setFilter(f)} className={`px-3 py-2 rounded-lg text-[11px] font-medium whitespace-nowrap ${filter === f ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"}`}>{filterLabels[f]}</button>
          ))}
        </div>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.users.colUser")}</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">{t("subAdmin.users.colRole")}</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">{t("subAdmin.users.colJoined")}</th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-500 dark:text-gray-400">{t("subAdmin.users.noUsersFound")}</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 text-[11px] font-bold">{u.name[0]}</div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{u.name}</p>
                        <p className="text-[10px] text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-gray-700 dark:text-gray-300 hidden sm:table-cell">{u.role}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${getStatusColor(u.status)}`}>{statusLabels[u.status] ?? u.status}</span></td>
                  <td className="px-4 py-3 text-[11px] text-gray-500 hidden md:table-cell">{new Date(u.joined).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={()=>{setSelected(u);setShowModal(true)}} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-blue-600"><Eye size={15} /></button>
                      <button onClick={()=>handleSuspend(u.id)} disabled={busyId === u.id} className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-amber-600">
                        {busyId === u.id ? <Loader2 size={15} className="animate-spin" /> : <AlertCircle size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("subAdmin.users.userDetailsTitle")}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 py-3">
              <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                {[[t("subAdmin.users.detailName"), selected.name], [t("auth.email"), selected.email], [t("subAdmin.users.detailPhone"), selected.phone ?? t("subAdmin.common.notSet")], [t("subAdmin.users.detailRole"), selected.role], [t("common.status"), statusLabels[selected.status] ?? selected.status], [t("subAdmin.users.detailJoined"), new Date(selected.joined).toLocaleDateString()], [t("subAdmin.users.detailOrdersJobs"), String(selected.orders)]].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-xs"><span className="text-gray-500">{l}</span><span className="font-medium text-gray-900 dark:text-white capitalize">{v}</span></div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={()=>setShowModal(false)}>{t("common.close")}</Button>
                <Button className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={()=>handleSuspend(selected.id)} disabled={busyId === selected.id}>
                  {busyId === selected.id ? <Loader2 size={16} className="animate-spin" /> : selected.status==="suspended"?t("subAdmin.users.reactivateButton"):t("subAdmin.users.suspendButton")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
