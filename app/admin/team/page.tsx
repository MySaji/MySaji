"use client"

import { useEffect, useState } from "react"
import { Plus, Trash2, Shield, Briefcase, UserCheck, Copy, Mail, Loader2, Pencil } from "lucide-react"
import { registerTeamMember } from "@/lib/actions/auth"
import {
  getTeamMembers, toggleTeamMemberActive, updateTeamMemberOrgInfo,
  type AdminTeamMember, type AdminTeamRole,
} from "@/lib/actions/admin-team"
import { useLocalization } from "@/lib/hooks/useLocalization"

type NewlyCreatedMember = AdminTeamMember & { password: string; credentialsSent: boolean }

export default function TeamPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<AdminTeamMember[]>([])
  const [newlyCreated, setNewlyCreated] = useState<NewlyCreatedMember | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [showCredentialsModal, setShowCredentialsModal] = useState(false)
  const [newMember, setNewMember] = useState<{ name: string; email: string; role: AdminTeamRole }>({ name: "", email: "", role: "sub-admin" })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addError, setAddError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const [editing, setEditing] = useState<AdminTeamMember | null>(null)
  const [editJobTitle, setEditJobTitle] = useState("")
  const [editDepartment, setEditDepartment] = useState("")
  const [editManagerId, setEditManagerId] = useState("")
  const [editError, setEditError] = useState("")
  const [isSavingOrgInfo, setIsSavingOrgInfo] = useState(false)

  const roleIcons: Record<AdminTeamRole, React.ReactNode> = {
    "sub-admin": <Shield size={16} />,
    secretary: <Briefcase size={16} />,
    agent: <UserCheck size={16} />,
  }

  const roleLabels: Record<AdminTeamRole, string> = {
    "sub-admin": t("admin.team.roleSubAdmin"),
    secretary: t("admin.team.roleSecretary"),
    agent: t("admin.team.roleAgent"),
  }

  const roleDescriptions: Record<AdminTeamRole, string> = {
    "sub-admin": t("admin.team.roleDescSubAdmin"),
    secretary: t("admin.team.roleDescSecretary"),
    agent: t("admin.team.roleDescAgent"),
  }

  const statusLabels: Record<string, string> = {
    active: t("admin.team.statusActive"),
    inactive: t("admin.team.statusInactive"),
  }

  const refresh = async () => {
    const data = await getTeamMembers()
    setTeamMembers(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const handleAddMember = async () => {
    if (!newMember.name || !newMember.email) return
    setIsSubmitting(true)
    setAddError("")

    const result = await registerTeamMember({ name: newMember.name, email: newMember.email, teamRole: newMember.role })
    setIsSubmitting(false)

    if (!result.success) {
      setAddError(result.error)
      return
    }

    setNewlyCreated({
      id: result.userId, name: newMember.name, email: newMember.email, role: newMember.role,
      status: "active", joinedDate: new Date().toISOString(), password: result.temporaryPassword, credentialsSent: false,
      teamMemberProfileId: null, jobTitle: null, department: null, managerId: null, managerName: null,
    })
    setShowCredentialsModal(true)
    setNewMember({ name: "", email: "", role: "sub-admin" })
    setShowModal(false)
    await refresh()
  }

  const handleSendCredentials = () => {
    setShowCredentialsModal(false)
  }

  const handleToggleActive = async (userId: string) => {
    setBusyId(userId)
    const result = await toggleTeamMemberActive({ userId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const openEdit = (member: AdminTeamMember) => {
    setEditing(member)
    setEditJobTitle(member.jobTitle ?? "")
    setEditDepartment(member.department ?? "")
    setEditManagerId(member.managerId ?? "")
    setEditError("")
  }

  const handleSaveOrgInfo = async () => {
    if (!editing?.teamMemberProfileId) return
    setIsSavingOrgInfo(true)
    setEditError("")
    const result = await updateTeamMemberOrgInfo({
      teamMemberProfileId: editing.teamMemberProfileId,
      jobTitle: editJobTitle,
      department: editDepartment,
      managerId: editManagerId || null,
    })
    setIsSavingOrgInfo(false)
    if (!result.success) { setEditError(result.error); return }
    setEditing(null)
    await refresh()
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("admin.team.title")}</h1>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus size={20} />
          {t("admin.team.addTeamMember")}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["sub-admin", "secretary", "agent"] as AdminTeamRole[]).map((role) => (
          <div key={role} className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <div className="flex items-center gap-2 mb-2">
              {roleIcons[role]}
              <h3 className="font-semibold text-gray-900 dark:text-white">{roleLabels[role]}</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">{roleDescriptions[role]}</p>
            <p className="text-xl font-bold text-blue-600">{teamMembers.filter((m) => m.role === role).length}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("admin.team.colName")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("auth.email")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("admin.team.colRole")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("admin.team.colOrgInfo")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("admin.team.colJoined")}</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("admin.team.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {teamMembers.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-600 dark:text-gray-400">{t("admin.team.noTeamMembers")}</td></tr>
              ) : teamMembers.map((member) => (
                <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-6 py-4 text-xs text-gray-900 dark:text-white">{member.name}</td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">{member.email}</td>
                  <td className="px-6 py-4 text-xs">
                    <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-[11px] font-medium">
                      {roleIcons[member.role]}
                      {roleLabels[member.role]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">
                    {member.jobTitle || member.department ? (
                      <>
                        {member.jobTitle && <p className="text-gray-900 dark:text-white">{member.jobTitle}</p>}
                        {member.department && <p className="text-[11px]">{member.department}</p>}
                        {member.managerName && <p className="text-[11px]">{t("admin.team.reportsToLabel", { name: member.managerName })}</p>}
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-400">{t("admin.team.notSetLabel")}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs">
                    <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-medium ${
                        member.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {statusLabels[member.status] ?? member.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-600 dark:text-gray-400">{new Date(member.joinedDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-xs">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(member)}
                        className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                        title={t("admin.team.editOrgInfo")}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleToggleActive(member.id)}
                        disabled={busyId === member.id}
                        className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded"
                        title={member.status === "active" ? t("admin.team.deactivate") : t("admin.team.reactivate")}
                      >
                        {busyId === member.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("admin.team.addTeamMember")}</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder={t("admin.team.fullNamePlaceholder")}
                value={newMember.name}
                onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <input
                type="email"
                placeholder={t("auth.email")}
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <select
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value as AdminTeamRole })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="sub-admin">{roleLabels["sub-admin"]}</option>
                <option value="secretary">{roleLabels.secretary}</option>
                <option value="agent">{roleLabels.agent}</option>
              </select>
              {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleAddMember}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? t("admin.team.creatingEllipsis") : t("admin.team.addMember")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCredentialsModal && newlyCreated && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">{t("admin.team.credentialsModalTitle")}</h2>
            <div className="space-y-4 mb-6">
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-3">
                <div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-1">{t("admin.team.colName")}</p>
                  <p className="text-xs font-medium text-gray-900 dark:text-white">{newlyCreated.name}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-1">{t("auth.email")}</p>
                  <p className="text-xs font-medium text-gray-900 dark:text-white">{newlyCreated.email}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-1">{t("admin.team.roleLabel")}</p>
                  <p className="text-xs font-medium text-gray-900 dark:text-white">{roleLabels[newlyCreated.role]}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-1">{t("admin.team.temporaryPassword")}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-white dark:bg-gray-600 p-2 rounded border border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white break-all">
                      {newlyCreated.password}
                    </code>
                    <button
                      onClick={() => navigator.clipboard.writeText(newlyCreated.password)}
                      className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900 rounded"
                      title={t("admin.team.copyPasswordTitle")}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
                <div className="pt-2 border-t border-gray-200 dark:border-gray-600">
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-1">{t("admin.team.loginUrlLabel")}</p>
                  <a
                    href="/team-login"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {typeof window !== "undefined" ? window.location.origin : ""}/team-login
                  </a>
                </div>
              </div>
              <p className="text-[11px] text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                {t("admin.team.shareCredentialsNote")}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {t("common.close")}
              </button>
              <button
                onClick={handleSendCredentials}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
              >
                <Mail size={16} />
                {t("admin.team.markAsSent")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{t("admin.team.editOrgInfoTitle")}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{editing.name}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("admin.team.jobTitleLabel")}</label>
                <input
                  type="text"
                  value={editJobTitle}
                  onChange={(e) => setEditJobTitle(e.target.value)}
                  placeholder={t("admin.team.jobTitlePlaceholder")}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("admin.team.departmentLabel")}</label>
                <input
                  type="text"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  placeholder={t("admin.team.departmentPlaceholder")}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t("admin.team.managerLabel")}</label>
                <select
                  value={editManagerId}
                  onChange={(e) => setEditManagerId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">{t("admin.team.noManagerOption")}</option>
                  {teamMembers
                    .filter((m) => m.teamMemberProfileId && m.teamMemberProfileId !== editing.teamMemberProfileId)
                    .map((m) => (
                      <option key={m.teamMemberProfileId} value={m.teamMemberProfileId!}>{m.name} ({roleLabels[m.role]})</option>
                    ))}
                </select>
              </div>
              {editError && <p className="text-xs text-red-600 dark:text-red-400">{editError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleSaveOrgInfo}
                  disabled={isSavingOrgInfo}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                >
                  {isSavingOrgInfo ? <Loader2 size={16} className="animate-spin" /> : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
