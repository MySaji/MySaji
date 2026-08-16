"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Search, Download, Eye, Edit, Power, Plus, X, Copy, Loader2 } from "lucide-react"
import {
  getAgents, createAgent, editAgent, toggleAgentActive,
  type SubAdminAgent,
} from "@/lib/actions/sub-admin-agents"
import { useLocalization } from "@/lib/hooks/useLocalization"

type ModalMode = "add" | "edit" | "view"

export default function AgentManagementPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [agents, setAgents] = useState<SubAdminAgent[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>("add")
  const [selectedAgent, setSelectedAgent] = useState<SubAdminAgent | null>(null)
  const [formData, setFormData] = useState({ name: "", email: "", phone: "" })
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [newCredentials, setNewCredentials] = useState<{ email: string; password: string } | null>(null)

  const refresh = async () => {
    const data = await getAgents()
    setAgents(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filteredAgents = agents.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddAgent = () => {
    setFormData({ name: "", email: "", phone: "" })
    setFormError("")
    setModalMode("add")
    setSelectedAgent(null)
    setShowModal(true)
  }

  const handleViewAgent = (agent: SubAdminAgent) => {
    setSelectedAgent(agent)
    setFormData({ name: agent.name, email: agent.email, phone: agent.phone ?? "" })
    setModalMode("view")
    setShowModal(true)
  }

  const handleEditAgent = (agent: SubAdminAgent) => {
    setSelectedAgent(agent)
    setFormData({ name: agent.name, email: agent.email, phone: agent.phone ?? "" })
    setFormError("")
    setModalMode("edit")
    setShowModal(true)
  }

  const handleSaveAgent = async () => {
    setIsSaving(true)
    setFormError("")
    if (modalMode === "add") {
      const result = await createAgent({ name: formData.name, email: formData.email })
      setIsSaving(false)
      if (!result.success) { setFormError(result.error); return }
      setShowModal(false)
      setNewCredentials({ email: formData.email, password: result.temporaryPassword! })
      await refresh()
    } else if (modalMode === "edit" && selectedAgent) {
      const result = await editAgent({ agentId: selectedAgent.id, name: formData.name, phone: formData.phone })
      setIsSaving(false)
      if (!result.success) { setFormError(result.error); return }
      setShowModal(false)
      await refresh()
    }
  }

  const handleToggleActive = async (agentId: string) => {
    setBusyId(agentId)
    const result = await toggleAgentActive({ agentId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    setShowModal(false)
    await refresh()
  }

  const handleExportAgents = () => {
    const data = {
      exportDate: new Date().toISOString(),
      totalAgents: agents.length,
      agents: agents.map(a => ({ id: a.id, name: a.name, email: a.email, phone: a.phone, status: a.status, casesAssigned: a.casesAssigned, casesResolved: a.casesResolved, commissionRate: a.commissionRate })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `agents-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("subAdmin.agents.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">{t("subAdmin.agents.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportAgents} variant="outline" className="bg-transparent gap-2">
            <Download size={18} />
            {t("subAdmin.common.export")}
          </Button>
          <Button onClick={handleAddAgent} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Plus size={18} />
            {t("subAdmin.agents.addAgentButton")}
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t("subAdmin.agents.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <Card className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.agents.colName")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("auth.email")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("common.status")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.agents.colCases")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.agents.colCommissionTier")}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">{t("subAdmin.common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAgents.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">{t("subAdmin.agents.noAgentsFound")}</td></tr>
              ) : filteredAgents.map(agent => (
                <tr key={agent.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{agent.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{agent.email}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      agent.status === "Active" ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                      "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-400"
                    }`}>
                      {agent.status === "Active" ? t("subAdmin.agents.statusActive") : t("subAdmin.agents.statusInactive")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{agent.casesResolved}/{agent.casesAssigned}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{agent.commissionTierName ? `${agent.commissionTierName} (${agent.commissionRate}%)` : "—"}</td>
                  <td className="px-6 py-4 flex gap-2">
                    <button onClick={() => handleViewAgent(agent)} className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors">
                      <Eye size={18} />
                    </button>
                    <button onClick={() => handleEditAgent(agent)} className="p-2 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors">
                      <Edit size={18} />
                    </button>
                    <button onClick={() => handleToggleActive(agent.id)} disabled={busyId === agent.id} className="p-2 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors">
                      {busyId === agent.id ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {modalMode === "add" ? t("subAdmin.agents.modalTitleAdd") : modalMode === "edit" ? t("subAdmin.agents.modalTitleEdit") : t("subAdmin.agents.modalTitleView")}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                  <X size={20} className="text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t("subAdmin.agents.fieldName")}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={modalMode === "view"}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-400">{t("auth.email")}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={modalMode !== "add"}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
                {modalMode !== "add" && (
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">{t("subAdmin.agents.fieldPhone")}</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      disabled={modalMode === "view"}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                )}
                {modalMode === "view" && selectedAgent && (
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400">{t("subAdmin.agents.casesResolvedAssignedLabel")}</label>
                    <p className="text-gray-900 dark:text-white font-medium py-2">{selectedAgent.casesResolved}/{selectedAgent.casesAssigned}</p>
                  </div>
                )}
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowModal(false)} disabled={isSaving}>
                  {t("common.cancel")}
                </Button>
                {modalMode !== "view" && (
                  <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleSaveAgent} disabled={isSaving || !formData.name || !formData.email}>
                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : t("subAdmin.agents.saveAgentButton")}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {newCredentials && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <div className="p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t("subAdmin.agents.agentCreatedTitle")}</h2>
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-3">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{t("auth.email")}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{newCredentials.email}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{t("subAdmin.agents.temporaryPasswordLabel")}</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm bg-white dark:bg-gray-600 p-2 rounded border border-gray-300 dark:border-gray-500 text-gray-900 dark:text-white break-all">{newCredentials.password}</code>
                    <button onClick={() => navigator.clipboard.writeText(newCredentials.password)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900 rounded">
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
                {t("subAdmin.agents.credentialsShareNotice", { path: "/team-login" })}
              </p>
              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => setNewCredentials(null)}>{t("subAdmin.agents.doneButton")}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
