"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Trophy, Medal, Loader2 } from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { getAgentLeaderboard, type AgentLeaderboardRow } from "@/lib/actions/agent-leaderboard"

export default function AgentLeaderboardPage() {
  const { t, tn } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [rows, setRows] = useState<AgentLeaderboardRow[]>([])

  useEffect(() => {
    getAgentLeaderboard().then((r) => setRows(r ?? [])).finally(() => setIsLoading(false))
  }, [])

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center"><Trophy className="w-5 h-5 text-amber-600" /></div>
    if (rank === 2) return <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center"><Medal className="w-5 h-5 text-gray-500" /></div>
    if (rank === 3) return <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center"><Medal className="w-5 h-5 text-orange-600" /></div>
    return <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-bold text-gray-600 dark:text-gray-400">#{rank}</div>
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const you = rows.find((r) => r.isYou)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{t("agent.leaderboard.title")}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t("agent.leaderboard.subtitle")}</p>
      </div>

      {you && (
        <Card className="p-4 lg:p-5 border-0 shadow-sm bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold">#{you.rank}</div>
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{t("agent.leaderboard.yourCurrentRank")}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{tn("agent.leaderboard.outOfAgents", rows.length)}</p>
              </div>
            </div>
            <div className="flex gap-4 sm:ml-auto">
              <div className="text-center"><p className="text-xs text-gray-500">{t("agent.common.assigned")}</p><p className="text-lg font-bold text-gray-900 dark:text-white">{you.casesAssigned}</p></div>
              <div className="text-center"><p className="text-xs text-gray-500">{t("agent.common.resolved")}</p><p className="text-lg font-bold text-emerald-600">{you.casesResolved}</p></div>
              <div className="text-center"><p className="text-xs text-gray-500">{t("agent.leaderboard.colRate")}</p><p className="text-lg font-bold text-amber-600">{you.resolutionRatePct}%</p></div>
            </div>
          </div>
        </Card>
      )}

      <Card className="border-0 shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">{t("agent.leaderboard.noAgentsFound")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.leaderboard.colRank")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.leaderboard.colAgent")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">{t("agent.common.assigned")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300">{t("agent.common.resolved")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">{t("agent.common.resolutionRate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map(a => (
                  <tr key={a.userId} className={`transition-colors ${a.isYou ? "bg-indigo-50 dark:bg-indigo-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"}`}>
                    <td className="px-4 py-3">{getRankIcon(a.rank)}</td>
                    <td className="px-4 py-3">
                      <p className={`text-sm font-semibold ${a.isYou ? "text-indigo-700 dark:text-indigo-400" : "text-gray-900 dark:text-white"}`}>{a.isYou ? t("agent.leaderboard.youSuffixTemplate", { name: a.name }) : a.name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hidden sm:table-cell">{a.casesAssigned}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{a.casesResolved}</td>
                    <td className="px-4 py-3 hidden md:table-cell"><span className="text-sm font-medium text-emerald-600">{a.resolutionRatePct}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
