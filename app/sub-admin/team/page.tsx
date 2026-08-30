"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Edit, Eye, X, Loader2 } from "lucide-react"
import { getTeamHierarchy, updateTeamMemberRole, type SubAdminTeamMember } from "@/lib/actions/sub-admin-team"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function TeamManagementPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<SubAdminTeamMember[]>([])
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<"edit" | "view">("view")
  const [selectedMember, setSelectedMember] = useState<SubAdminTeamMember | null>(null)
  const [formData, setFormData] = useState({ jobTitle: "", department: "", managerId: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")

  const refresh = async () => {
    const data = await getTeamHierarchy()
    setTeamMembers(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const teamStats = [
    { label: t("subAdmin.team.statTotalMembers"), value: teamMembers.length, icon: "👥" },
    { label: t("subAdmin.team.statActiveMembers"), value: teamMembers.filter(m => m.status === "Active").length, icon: "✓" },
    { label: t("subAdmin.team.statTotalAgentsSupervised"), value: teamMembers.reduce((sum, m) => sum + m.reportsCount, 0), icon: "📊" },
  ]

  const handleViewMember = (member: SubAdminTeamMember) => {
    setSelectedMember(member)
    setModalMode("view")
    setShowModal(true)
  }

  const handleEditMember = (member: SubAdminTeamMember) => {
    setSelectedMember(member)
    setFormData({ jobTitle: member.jobTitle ?? "", department: member.department ?? "", managerId: member.managerId ?? "" })
    setFormError("")
    setModalMode("edit")
    setShowModal(true)
  }

  const handleSaveMember = async () => {
    if (!selectedMember) return
    setIsSaving(true)
    setFormError("")
    const result = await updateTeamMemberRole({
      teamMemberProfileId: selectedMember.teamMemberProfileId,
      jobTitle: formData.jobTitle,
      department: formData.department,
      managerId: formData.managerId || null,
    })
    setIsSaving(false)
    if (!result.success) { setFormError(result.error); return }
    setShowModal(false)
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const managerOptions = teamMembers.filter(m => m.teamMemberProfileId !== selectedMember?.teamMemberProfileId)

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t("subAdmin.team.title")}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">{t("subAdmin.team.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {teamStats.map((stat, idx) => (
          <Card key={idx} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-2">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
              </div>
              <span className="text-3xl">{stat.icon}</span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">{t("subAdmin.team.agentsSectionTitle")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.team.colName")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.team.colJobTitle")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.team.colDepartment")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.team.colReportsTo")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.team.colSupervises")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {teamMembers.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-xs text-gray-500 dark:text-gray-400">{t("subAdmin.team.noAgentsYet")}</td></tr>
              ) : teamMembers.map(member => (
                <tr key={member.teamMemberProfileId} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="px-6 py-4 text-xs font-medium text-gray-900 dark:text-white">{member.name}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{member.jobTitle ?? "—"}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{member.department ?? "—"}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{member.managerName ?? "—"}</td>
                  <td className="px-6 py-4 text-xs text-gray-700 dark:text-gray-300">{member.reportsCount}</td>
                  <td className="px-6 py-4 text-xs">
                    <span className={`px-3 py-1 rounded-full text-[11px] font-medium ${member.status === "Active" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400"}`}>
                      {member.status === "Active" ? t("subAdmin.team.statusActive") : t("subAdmin.team.statusInactive")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs flex gap-2">
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 gap-1" onClick={() => handleViewMember(member)}>
                      <Eye size={16} />
                    </Button>
                    <Button size="sm" variant="outline" className="bg-transparent gap-1" onClick={() => handleEditMember(member)}>
                      <Edit size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showModal && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {modalMode === "edit" ? t("subAdmin.team.modalTitleEdit") : t("subAdmin.team.modalTitleView")}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              {modalMode === "view" ? (
                <div className="space-y-3">
                  {[[t("subAdmin.team.detailName"), selectedMember.name], [t("auth.email"), selectedMember.email], [t("subAdmin.team.detailJobTitle"), selectedMember.jobTitle ?? t("subAdmin.common.notSet")], [t("subAdmin.team.detailDepartment"), selectedMember.department ?? t("subAdmin.common.notSet")], [t("subAdmin.team.detailReportsTo"), selectedMember.managerName ?? t("subAdmin.common.nobody")], [t("subAdmin.team.detailSupervises"), t("subAdmin.team.agentCount", { count: selectedMember.reportsCount })], [t("common.status"), selectedMember.status === "Active" ? t("subAdmin.team.statusActive") : t("subAdmin.team.statusInactive")]].map(([l, v]) => (
                    <div key={l} className="flex justify-between text-xs"><span className="text-gray-500">{l}</span><span className="font-medium text-gray-900 dark:text-white">{v}</span></div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">{t("subAdmin.team.detailJobTitle")}</label>
                    <select
                      value={formData.jobTitle}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t("subAdmin.common.notSet")}</option>
                      <option value="Team Lead">{t("subAdmin.team.jobTitleTeamLead")}</option>
                      <option value="Operations Manager">{t("subAdmin.team.jobTitleOperationsManager")}</option>
                      <option value="Quality Analyst">{t("subAdmin.team.jobTitleQualityAnalyst")}</option>
                      <option value="Junior Agent">{t("subAdmin.team.jobTitleJuniorAgent")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">{t("subAdmin.team.detailDepartment")}</label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder={t("subAdmin.team.departmentPlaceholder")}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600 dark:text-gray-400">{t("subAdmin.team.detailReportsTo")}</label>
                    <select
                      value={formData.managerId}
                      onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">{t("subAdmin.common.nobody")}</option>
                      {managerOptions.map(m => <option key={m.teamMemberProfileId} value={m.teamMemberProfileId}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowModal(false)} disabled={isSaving}>
                  {modalMode === "view" ? t("common.close") : t("common.cancel")}
                </Button>
                {modalMode === "edit" && (
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSaveMember} disabled={isSaving}>
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : t("subAdmin.team.saveChangesButton")}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
