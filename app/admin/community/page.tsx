"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MessageCircle, ImageIcon, Video, Archive, ArchiveRestore, Trash2, Search, Users, Loader2 } from "lucide-react"
import { useLocalization } from "@/lib/hooks/useLocalization"
import {
  getCommunityPosts, toggleArchiveCommunityPost, deleteCommunityPost,
  type AdminCommunityPost,
} from "@/lib/actions/admin-community"

export default function AdminCommunityPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [items, setItems] = useState<AdminCommunityPost[]>([])
  const [filter, setFilter] = useState<"all" | "post" | "group_post">("all")
  const [search, setSearch] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = async () => {
    const data = await getCommunityPosts()
    setItems(data)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filtered = items.filter((i) => {
    if (filter !== "all" && i.type !== filter) return false
    if (search && !i.content.toLowerCase().includes(search.toLowerCase()) && !i.authorName.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleToggleArchive = async (postId: string) => {
    setBusyId(postId)
    const result = await toggleArchiveCommunityPost({ postId })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
    await refresh()
  }

  const handleDelete = async (item: AdminCommunityPost) => {
    if (!confirm(t("admin.community.deleteConfirm"))) return
    setBusyId(item.id)
    const result = await deleteCommunityPost({ id: item.id, type: item.type })
    setBusyId(null)
    if (!result.success) { alert(result.error); return }
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
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">{t("admin.community.title")}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("admin.community.subtitle")}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 flex-1">
          <Search size={16} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.community.searchPlaceholder")} className="bg-transparent text-sm outline-none flex-1 text-gray-700 dark:text-gray-200 placeholder:text-gray-400" />
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
          {(["all", "post", "group_post"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === f ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm" : "text-gray-500"}`}>
              {f === "all" ? t("admin.community.filterAll") : f === "post" ? t("admin.community.filterFeed") : t("admin.community.filterGroups")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map((item) => {
          const isBusy = busyId === item.id
          return (
            <Card key={`${item.type}-${item.id}`} className={`p-4 ${item.isArchived ? "opacity-60" : ""}`}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0 text-gray-500">
                  {item.type === "group_post" ? <Users size={16} /> : <MessageCircle size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{item.authorName}</span>
                    {item.groupName && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{item.groupName}</span>
                    )}
                    {item.isArchived && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">{t("admin.community.archivedBadge")}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 leading-relaxed line-clamp-3">{item.content}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    {item.imageCount > 0 && <span className="flex items-center gap-1"><ImageIcon size={12} />{item.imageCount}</span>}
                    {item.hasVideo && <span className="flex items-center gap-1"><Video size={12} />{t("admin.community.videoBadge")}</span>}
                    <span>{t("admin.community.likesCount", { count: item.likeCount })}</span>
                    <span>{t("admin.community.commentsCount", { count: item.commentCount })}</span>
                  </div>
                </div>
                <div className="flex sm:flex-col gap-2 flex-shrink-0">
                  {item.type === "post" && (
                    <Button size="sm" variant="outline" onClick={() => handleToggleArchive(item.id)} disabled={isBusy} className="gap-1 text-xs">
                      {item.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                      {item.isArchived ? t("admin.community.unarchive") : t("admin.community.archive")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => handleDelete(item)} disabled={isBusy} className="gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20">
                    <Trash2 size={14} />{t("admin.community.delete")}
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <MessageCircle size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("admin.community.emptyText")}</p>
          </Card>
        )}
      </div>
    </div>
  )
}
