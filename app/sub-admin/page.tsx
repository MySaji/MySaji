"use client"

import useSWR from "swr"
import { Users, Briefcase, CheckCircle, AlertCircle, ArrowRight, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"
import { getSubAdminDashboard } from "@/lib/actions/sub-admin-dashboard"
import { withTimeout, DASHBOARD_FETCH_TIMEOUT_MS } from "@/lib/swr-utils"
import { useLocalization } from "@/lib/hooks/useLocalization"

const ROLE_COLOR: Record<string, string> = {
  Customers: "#3b82f6", Providers: "#10b981", Shopkeepers: "#f59e0b", Agents: "#8b5cf6",
}

export default function SubAdminDashboard() {
  const router = useRouter()
  const { t } = useLocalization()
  const { data, isLoading } = useSWR(
    "sub-admin-dashboard", () => withTimeout(getSubAdminDashboard(), DASHBOARD_FETCH_TIMEOUT_MS),
  )

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const roleLabels: Record<string, string> = {
    Customers: t("subAdmin.dashboard.roleCustomers"),
    Providers: t("subAdmin.dashboard.roleProviders"),
    Shopkeepers: t("subAdmin.dashboard.roleShopkeepers"),
    Agents: t("subAdmin.dashboard.roleAgents"),
  }

  const stats = [
    { icon: Users, label: t("subAdmin.dashboard.statTotalUsers"), value: data.totalUsers.toLocaleString(), change: data.usersGrowthPct, color: "from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20", iconColor: "text-blue-600" },
    { icon: Briefcase, label: t("subAdmin.dashboard.statActiveJobs"), value: data.activeJobs.toLocaleString(), change: data.activeJobsGrowthPct, color: "from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20", iconColor: "text-amber-600" },
    { icon: CheckCircle, label: t("subAdmin.dashboard.statVerifiedUsers"), value: data.verifiedUsers.toLocaleString(), change: data.verifiedUsersGrowthPct, color: "from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20", iconColor: "text-emerald-600" },
    { icon: AlertCircle, label: t("subAdmin.dashboard.statPendingApprovals"), value: data.pendingApprovals.toLocaleString(), change: null, color: "from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20", iconColor: "text-red-600" },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{t("subAdmin.dashboard.title")}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("subAdmin.dashboard.subtitle")}</p>
        </div>
        <Button onClick={() => router.push("/sub-admin/reports")} className="bg-blue-600 hover:bg-blue-700 text-sm">{t("subAdmin.dashboard.generateReport")}</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {stats.map((s, i) => (
          <Card key={i} className={`p-4 lg:p-5 border-0 shadow-sm bg-gradient-to-br ${s.color}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-white/60 dark:bg-gray-700/50">
                <s.icon className={`w-5 h-5 ${s.iconColor}`} />
              </div>
              {s.change !== null && (
                <span className={`text-xs font-semibold ${s.change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {s.change >= 0 ? "+" : ""}{s.change}%
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">{s.label}</p>
            <p className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4 lg:p-5 border-0 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("subAdmin.dashboard.weeklyRegistrationsTitle")}</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
              <Bar dataKey="users" fill="#3b82f6" radius={[6, 6, 0, 0]} name={t("subAdmin.dashboard.newUsersLabel")} />
              <Bar dataKey="verifications" fill="#10b981" radius={[6, 6, 0, 0]} name={t("subAdmin.dashboard.verificationsLabel")} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4 lg:p-5 border-0 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("subAdmin.dashboard.userRoleDistributionTitle")}</h2>
          {data.roleData.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{t("subAdmin.dashboard.noUsersYet")}</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={data.roleData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value">
                    {data.roleData.map((entry) => (
                      <Cell key={entry.name} fill={ROLE_COLOR[entry.name] ?? "#9ca3af"} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {data.roleData.map((r) => (
                  <div key={r.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ROLE_COLOR[r.name] ?? "#9ca3af" }} />
                      <span className="text-gray-600 dark:text-gray-300">{roleLabels[r.name] ?? r.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900 dark:text-white">{r.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 lg:p-5 border-0 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{t("subAdmin.dashboard.pendingActionsTitle")}</h2>
            <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 px-2 py-0.5 rounded-full font-medium">{data.pendingActions.length}</span>
          </div>
          {data.pendingActions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{t("subAdmin.dashboard.allCaughtUp")}</p>
          ) : (
            <div className="space-y-2">
              {data.pendingActions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => router.push(a.type === "verification" ? "/sub-admin/verifications" : "/sub-admin/users")}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.urgency === "high" ? "bg-red-500" : a.urgency === "medium" ? "bg-amber-500" : "bg-blue-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.title}</p>
                    <p className="text-[10px] text-gray-500">{new Date(a.time).toLocaleDateString()}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4 lg:p-5 border-0 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{t("subAdmin.dashboard.recentActivityTitle")}</h2>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{t("subAdmin.dashboard.noRecentActivity")}</p>
          ) : (
            <div className="space-y-3">
              {data.recentActivity.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${a.kind === "success" ? "bg-emerald-100 dark:bg-emerald-900/30" : a.kind === "warning" ? "bg-amber-100 dark:bg-amber-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                    <CheckCircle className={`w-4 h-4 ${a.kind === "success" ? "text-emerald-600" : a.kind === "warning" ? "text-amber-600" : "text-red-600"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{a.action}</p>
                    <p className="text-xs text-gray-500">{a.detail}, {new Date(a.time).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
