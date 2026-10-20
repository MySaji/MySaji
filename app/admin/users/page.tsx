"use client"

import { useEffect, useState } from "react"
import { Search, Download, Trash2, Eye, CheckCircle2, AlertCircle, TrendingUp, Mail, Phone, Edit, Loader2, Ban } from "lucide-react"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import {
  getAdminUsers, toggleSuspendUser, softDeleteUser, editUser,
  type AdminUserRow, type AdminUserStatus,
} from "@/backend/actions/admin-users"

const STATUS_COLOR: Record<AdminUserStatus, string> = {
  active: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
  pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
  disputed: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  suspended: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
}

const PAGE_SIZE = 20

export default function UsersPage() {
  const { t, formatMoney } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")
  useEffect(() => { const search = new URLSearchParams(window.location.search).get("search"); if (search) setSearchTerm(search.slice(0, 200)) }, [])
  const [activeFilter, setActiveFilter] = useState<"all" | AdminUserStatus>("all")
  const [showUserModal, setShowUserModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null)
  const [isEditingUser, setIsEditingUser] = useState(false)
  const [editForm, setEditForm] = useState({ name: "", phone: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const STATUS_LABEL: Record<AdminUserStatus, string> = {
    active: t("admin.users.statusActive"),
    pending: t("admin.users.statusPending"),
    disputed: t("admin.users.statusDisputed"),
    suspended: t("admin.users.statusSuspended"),
  }

  const refresh = async () => {
    const result = await getAdminUsers({ search: searchTerm, filter: activeFilter, page, pageSize: PAGE_SIZE })
    setUsers(result.users)
    setTotalCount(result.totalCount)
  }

  useEffect(() => {
    setIsLoading(true)
    refresh().finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, activeFilter])

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1)
      refresh()
    }, 350)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm])

  const filters: { label: string; type: "all" | AdminUserStatus }[] = [
    { label: t("admin.users.filterAll"), type: "all" },
    { label: STATUS_LABEL.active, type: "active" },
    { label: STATUS_LABEL.pending, type: "pending" },
    { label: STATUS_LABEL.disputed, type: "disputed" },
    { label: STATUS_LABEL.suspended, type: "suspended" },
  ]

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.setTextColor(30, 30, 30)
      doc.text("Users Report", 14, 20)
      doc.setFontSize(10)
      doc.setTextColor(100, 100, 100)
      doc.text(`Filter: ${activeFilter} | Generated: ${new Date().toLocaleDateString()}`, 14, 30)

      const tableData = users.map((user) => [
        user.id, user.name, user.email, user.role, STATUS_LABEL[user.status],
        `KES ${user.earnings.toLocaleString()}`,
        new Date(user.joined).toLocaleDateString(),
        user.orders.toString(),
      ])

      autoTable(doc, {
        head: [["ID", "Name", "Email", "Role", "Status", "Earnings", "Joined", "Orders"]],
        body: tableData,
        startY: 40,
        theme: "grid",
        headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
        bodyStyles: { fontSize: 9, textColor: [50, 50, 50] },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 },
      })

      const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 100
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`Total Users: ${users.length}`, 14, finalY + 10)

      doc.save(`users-report-${new Date().toISOString().split("T")[0]}.pdf`)
    } catch (error) {
      console.error("[Saji] PDF export error:", error)
    }
  }

  const handleSuspend = async (userId: string) => {
    setBusyId(userId)
    const result = await toggleSuspendUser({ userId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
    if (selectedUser?.id === userId) setShowUserModal(false)
  }

  const handleDelete = async (userId: string) => {
    if (!confirm(t("admin.users.confirmRemoveUser"))) return
    setBusyId(userId)
    const result = await softDeleteUser({ userId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const openEdit = (user: AdminUserRow) => {
    setSelectedUser(user)
    setEditForm({ name: user.name, phone: user.phone ?? "" })
    setIsEditingUser(true)
    setShowUserModal(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedUser) return
    setIsSaving(true)
    const result = await editUser({ userId: selectedUser.id, name: editForm.name, phone: editForm.phone })
    setIsSaving(false)
    if (!result.success) { alert(result.error); return }
    setIsEditingUser(false)
    setShowUserModal(false)
    await refresh()
  }

  const activeCount = users.filter((u) => u.status === "active").length
  const disputedCount = users.filter((u) => u.status === "disputed").length
  const totalEarnings = users.reduce((sum, u) => sum + u.earnings, 0)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{t("admin.users.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400">{t("admin.users.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-0 shadow-lg min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.users.statTotalUsers")}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1 truncate">{totalCount}</p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0"><Search className="w-5 h-5 text-blue-600" /></div>
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-lg min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.users.statActiveThisPage")}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1 truncate">{activeCount}</p>
            </div>
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex-shrink-0"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-lg min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.users.statDisputedThisPage")}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1 truncate">{disputedCount}</p>
            </div>
            <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0"><AlertCircle className="w-5 h-5 text-red-600" /></div>
          </div>
        </Card>
        <Card className="p-4 border-0 shadow-lg min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 dark:text-gray-400">{t("admin.users.statEarningsThisPage")}</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white mt-1 truncate">{formatMoney(totalEarnings)}</p>
            </div>
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex-shrink-0"><TrendingUp className="w-5 h-5 text-yellow-600" /></div>
          </div>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="w-full sm:flex-1 max-w-md relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <Input
            placeholder={t("admin.users.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={handleExportPDF} className="bg-green-600 hover:bg-green-700 gap-2">
          <Download size={18} />
          <span className="hidden sm:inline">{t("admin.users.exportPdf")}</span>
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {filters.map((filter) => (
          <button
            key={filter.type}
            onClick={() => { setActiveFilter(filter.type); setPage(1) }}
            className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors flex items-center gap-2 text-xs ${
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
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.users.colUser")}</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("auth.email")}</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.users.colRole")}</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("common.status")}</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.users.colEarnings")}</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.users.colOrders")}</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-900 dark:text-white">{t("admin.users.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.length > 0 ? (
                  users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-xs">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-gray-900 dark:text-white">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">{user.email}</td>
                      <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300 font-medium">{user.role}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${STATUS_COLOR[user.status]}`}>
                          {STATUS_LABEL[user.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(user.earnings)}</td>
                      <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{user.orders}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setSelectedUser(user); setIsEditingUser(false); setShowUserModal(true) }} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-blue-600 dark:text-blue-400" title={t("admin.users.viewTitle")}>
                            <Eye size={18} />
                          </button>
                          <button onClick={() => openEdit(user)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-purple-600 dark:text-purple-400" title={t("admin.users.editTitle")}>
                            <Edit size={18} />
                          </button>
                          <button onClick={() => handleSuspend(user.id)} disabled={busyId === user.id} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-orange-600 dark:text-orange-400" title={user.status === "suspended" ? t("admin.users.reactivate") : t("admin.users.suspend")}>
                            {busyId === user.id ? <Loader2 size={18} className="animate-spin" /> : <Ban size={18} />}
                          </button>
                          <button onClick={() => handleDelete(user.id)} disabled={busyId === user.id} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-red-600 dark:text-red-400" title={t("admin.users.removeTitle")}>
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">
                      {t("admin.users.noUsersFound")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>{t("admin.users.pageOf", { page, totalPages, totalCount })}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">{t("admin.users.prevPage")}</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">{t("admin.users.nextPage")}</button>
          </div>
        </div>
      </Card>

      {/* User Detail / Edit Modal */}
      <Dialog open={showUserModal} onOpenChange={setShowUserModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditingUser ? t("admin.users.modalEditUser") : t("admin.users.modalUserDetails")}</DialogTitle>
          </DialogHeader>

          {selectedUser && !isEditingUser && (
            <div className="space-y-6 py-4">
              <div className="flex items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedUser.name}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{selectedUser.role}</p>
                  <span className={`mt-2 inline-block px-3 py-1 rounded-full text-[11px] font-semibold ${STATUS_COLOR[selectedUser.status]}`}>
                    {STATUS_LABEL[selectedUser.status]}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("admin.users.joined")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{new Date(selectedUser.joined).toLocaleDateString()}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("auth.email")}</p>
                    <p className="font-semibold text-gray-900 dark:text-white text-xs mt-1">{selectedUser.email}</p>
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <div>
                    <p className="text-[11px] text-muted-foreground">{t("admin.users.phone")}</p>
                    <p className="font-semibold text-gray-900 dark:text-white text-xs mt-1">{selectedUser.phone ?? t("admin.users.notSet")}</p>
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("admin.users.totalEarnings")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{formatMoney(selectedUser.earnings)}</p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-[11px] text-muted-foreground">{t("admin.users.ordersDisputes")}</p>
                  <p className="font-semibold text-gray-900 dark:text-white mt-1">{selectedUser.orders} / {selectedUser.disputes}</p>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => handleSuspend(selectedUser.id)}>
                  {selectedUser.status === "suspended" ? t("admin.users.reactivate") : t("admin.users.suspend")}
                </Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => openEdit(selectedUser)}>{t("common.edit")}</Button>
              </div>
            </div>
          )}

          {selectedUser && isEditingUser && (
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("admin.users.nameLabel")}</label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">{t("admin.users.phone")}</label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setIsEditingUser(false)} disabled={isSaving}>{t("common.cancel")}</Button>
                <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSaveEdit} disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("admin.users.saveChanges")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
