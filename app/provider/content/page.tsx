"use client"

import { useEffect, useState } from "react"
import {
  Heart, MessageCircle, Share2, MoreHorizontal, Trash2,
  Calendar, Search, Grid, List,
  Play, ImageIcon, Video, ArrowUpRight,
  Pin, Archive, Loader2
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import NextImage from "next/image"
import { getMyPosts, togglePinPost, toggleArchivePost, type ProviderPost } from "@/lib/actions/provider-content"
import { createPost, deletePost } from "@/lib/actions/community"
import { useLocalization } from "@/lib/hooks/useLocalization"

export default function ProviderContentPage() {
  const { t } = useLocalization()
  const [isLoading, setIsLoading] = useState(true)
  const [posts, setPosts] = useState<ProviderPost[]>([])
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "archived">("all")
  const [filterType, setFilterType] = useState<"all" | "image" | "video" | "carousel">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedPost, setSelectedPost] = useState<ProviderPost | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [postToDelete, setPostToDelete] = useState<string | null>(null)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [newPostCaption, setNewPostCaption] = useState("")
  const [newPostImages, setNewPostImages] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)

  const refresh = () => getMyPosts().then(setPosts)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
  }, [])

  const filteredPosts = posts.filter(post => {
    const matchesStatus = filterStatus === "all" || (filterStatus === "archived" ? post.isArchived : !post.isArchived)
    const matchesType = filterType === "all" || post.type === filterType
    const matchesSearch = post.caption.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesStatus && matchesType && matchesSearch
  })

  const totals = {
    likes: posts.reduce((sum, p) => sum + p.likeCount, 0),
    comments: posts.reduce((sum, p) => sum + p.commentCount, 0),
    shares: posts.reduce((sum, p) => sum + p.shareCount, 0)
  }

  const handleDelete = async (id: string) => {
    await deletePost({ postId: id })
    setShowDeleteConfirm(false)
    setPostToDelete(null)
    setSelectedPost(null)
    await refresh()
  }

  const handleTogglePin = async (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, isPinned: !p.isPinned } : p))
    await togglePinPost({ postId: id })
    await refresh()
  }

  const handleArchive = async (id: string) => {
    setPosts(prev => prev.map(p => p.id === id ? { ...p, isArchived: !p.isArchived } : p))
    await toggleArchivePost({ postId: id })
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M"
    if (num >= 1000) return (num / 1000).toFixed(1) + "K"
    return num.toString()
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="w-4 h-4" />
      case "carousel": return <Grid className="w-4 h-4" />
      default: return <ImageIcon className="w-4 h-4" />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "video": return t("provider.content.typeVideo")
      case "carousel": return t("provider.content.typeCarousel")
      default: return t("provider.content.typeImage")
    }
  }

  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4 - newPostImages.length)
    files.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => setNewPostImages(prev => [...prev, String(reader.result)])
      reader.readAsDataURL(file)
    })
  }

  const handleCreatePost = async () => {
    if (!newPostCaption.trim() && newPostImages.length === 0) return
    setIsSaving(true)
    const result = await createPost({ content: newPostCaption, images: newPostImages })
    setIsSaving(false)
    if (result.success) {
      setShowCreatePost(false)
      setNewPostCaption("")
      setNewPostImages([])
      await refresh()
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
    <div className="p-4 lg:p-8 pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">{t("provider.content.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("provider.content.subtitle")}</p>
        </div>
        <Button onClick={() => setShowCreatePost(true)} className="bg-primary hover:bg-primary/90">
          {t("provider.content.createNewPost")}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center">
              <Heart className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{formatNumber(totals.likes)}</p>
              <p className="text-[11px] text-muted-foreground">{t("provider.content.statLikes")}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{formatNumber(totals.comments)}</p>
              <p className="text-[11px] text-muted-foreground">{t("provider.content.statComments")}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{formatNumber(totals.shares)}</p>
              <p className="text-[11px] text-muted-foreground">{t("provider.content.statShares")}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("provider.content.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>

          <div className="flex flex-wrap gap-2">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)} className="px-3 py-2 rounded-lg border border-input bg-background text-xs">
              <option value="all">{t("provider.content.filterAllStatus")}</option>
              <option value="published">{t("provider.content.filterPublished")}</option>
              <option value="archived">{t("provider.content.filterArchived")}</option>
            </select>

            <select value={filterType} onChange={(e) => setFilterType(e.target.value as typeof filterType)} className="px-3 py-2 rounded-lg border border-input bg-background text-xs">
              <option value="all">{t("provider.content.filterAllTypes")}</option>
              <option value="image">{t("provider.content.filterImages")}</option>
              <option value="video">{t("provider.content.filterVideos")}</option>
              <option value="carousel">{t("provider.content.filterCarousels")}</option>
            </select>

            <div className="flex border border-input rounded-lg overflow-hidden">
              <button onClick={() => setViewMode("grid")} aria-label={t("common.gridView")} aria-pressed={viewMode === "grid"} className={`p-2 ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                <Grid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode("list")} aria-label={t("common.listView")} aria-pressed={viewMode === "list"} className={`p-2 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Posts Grid/List */}
      {filteredPosts.length === 0 ? (
        <Card className="p-12 text-center">
          <ImageIcon className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-2">{t("provider.content.noPostsFoundTitle")}</h3>
          <p className="text-muted-foreground mb-4">{t("provider.content.noPostsFoundDesc")}</p>
          <Button onClick={() => setShowCreatePost(true)}>{t("provider.content.createNewPost")}</Button>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPosts.map(post => (
            <Card key={post.id} className="overflow-hidden group">
              <div className="relative aspect-square cursor-pointer" onClick={() => setSelectedPost(post)}>
                <NextImage src={post.thumbnail || "/placeholder.svg"} alt={post.caption} fill className="object-cover" />

                <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 bg-black/60 rounded-full text-white text-[11px]">
                  {getTypeIcon(post.type)}
                  <span>{getTypeLabel(post.type)}</span>
                </div>

                {post.isPinned && (
                  <div className="absolute top-2 right-2 p-1.5 bg-yellow-500 rounded-full">
                    <Pin className="w-3 h-3 text-white" />
                  </div>
                )}

                {post.isArchived && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 rounded-full text-[11px] font-medium bg-gray-500 text-white">
                    {t("provider.content.archivedBadge")}
                  </div>
                )}

                {post.type === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-black/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play className="w-6 h-6 text-white fill-white ml-1" />
                    </div>
                  </div>
                )}

                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6">
                  <div className="flex items-center gap-1 text-white">
                    <Heart className="w-5 h-5" />
                    <span className="font-semibold">{formatNumber(post.likeCount)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-white">
                    <MessageCircle className="w-5 h-5" />
                    <span className="font-semibold">{post.commentCount}</span>
                  </div>
                </div>
              </div>

              <div className="p-4">
                <p className="text-xs text-foreground line-clamp-2 mb-2">{post.caption}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Calendar className="w-3 h-3" />
                    {formatDate(post.createdAt)}
                  </div>

                  <div className="relative group/menu">
                    <button aria-label={t("common.moreOptions")} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
                    <div className="absolute right-0 bottom-full mb-1 w-40 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-10">
                      <button onClick={() => setSelectedPost(post)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors">
                        <ArrowUpRight className="w-4 h-4" /> {t("common.viewDetails")}
                      </button>
                      <button onClick={() => handleTogglePin(post.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors">
                        <Pin className="w-4 h-4" /> {post.isPinned ? t("provider.content.unpin") : t("provider.content.pinToTop")}
                      </button>
                      <button onClick={() => handleArchive(post.id)} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors">
                        <Archive className="w-4 h-4" /> {post.isArchived ? t("provider.content.restoreAction") : t("provider.content.archiveAction")}
                      </button>
                      <button onClick={() => { setPostToDelete(post.id); setShowDeleteConfirm(true) }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-4 h-4" /> {t("common.delete")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPosts.map(post => (
            <Card key={post.id} className="p-4">
              <div className="flex gap-4">
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer" onClick={() => setSelectedPost(post)}>
                  <NextImage src={post.thumbnail || "/placeholder.svg"} alt={post.caption} fill className="object-cover" />
                  {post.type === "video" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-medium text-foreground line-clamp-2">{post.caption}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {post.isPinned && <Pin className="w-4 h-4 text-yellow-500" />}
                      <span className={`px-2 py-0.5 rounded-full text-[11px] ${post.isArchived ? "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"}`}>
                        {post.isArchived ? t("provider.content.archivedStatus") : t("provider.content.publishedStatus")}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-2">
                    <div className="flex items-center gap-1"><Heart className="w-4 h-4" /><span>{formatNumber(post.likeCount)}</span></div>
                    <div className="flex items-center gap-1"><MessageCircle className="w-4 h-4" /><span>{post.commentCount}</span></div>
                    <div className="flex items-center gap-1"><Share2 className="w-4 h-4" /><span>{post.shareCount}</span></div>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">{getTypeIcon(post.type)} {getTypeLabel(post.type)}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(post.createdAt)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleTogglePin(post.id)}>
                    <Pin className={`w-4 h-4 ${post.isPinned ? "text-yellow-500" : ""}`} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleArchive(post.id)}>
                    <Archive className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setPostToDelete(post.id); setShowDeleteConfirm(true) }} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Post Details Modal */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedPost && (
            <>
              <DialogHeader><DialogTitle>{t("provider.content.postDetailsTitle")}</DialogTitle></DialogHeader>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="relative aspect-video rounded-lg overflow-hidden">
                    <NextImage src={selectedPost.media[0] || "/placeholder.svg"} alt="" fill className="object-cover" />
                    {selectedPost.type === "video" && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <button aria-label={t("common.playVideo")} className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center hover:scale-110 transition-transform">
                          <Play className="w-8 h-8 text-gray-900 fill-gray-900 ml-1" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-foreground">{selectedPost.caption}</p>
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(selectedPost.createdAt)}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-semibold text-foreground">{t("provider.content.engagementTitle")}</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                      <Heart className="w-5 h-5 text-red-500 mx-auto mb-1" />
                      <p className="text-base font-bold text-foreground">{formatNumber(selectedPost.likeCount)}</p>
                      <p className="text-[11px] text-muted-foreground">{t("provider.content.likesLabel")}</p>
                    </div>
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                      <MessageCircle className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                      <p className="text-base font-bold text-foreground">{selectedPost.commentCount}</p>
                      <p className="text-[11px] text-muted-foreground">{t("provider.content.commentsLabel")}</p>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                      <Share2 className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                      <p className="text-base font-bold text-foreground">{selectedPost.shareCount}</p>
                      <p className="text-[11px] text-muted-foreground">{t("provider.content.sharesLabel")}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => handleTogglePin(selectedPost.id)}>
                      <Pin className="w-4 h-4 mr-2" />{selectedPost.isPinned ? t("provider.content.unpin") : t("provider.content.pinToTop")}
                    </Button>
                    <Button variant="outline" className="flex-1 bg-transparent" onClick={() => handleArchive(selectedPost.id)}>
                      <Archive className="w-4 h-4 mr-2" />{selectedPost.isArchived ? t("provider.content.restoreAction") : t("provider.content.archiveAction")}
                    </Button>
                    <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 bg-transparent" onClick={() => { setPostToDelete(selectedPost.id); setShowDeleteConfirm(true) }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("provider.content.deletePostTitle")}</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">{t("provider.content.deletePostBody")}</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setShowDeleteConfirm(false)}>{t("common.cancel")}</Button>
            <Button variant="destructive" className="flex-1" onClick={() => postToDelete && handleDelete(postToDelete)}>{t("common.delete")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Post Modal */}
      <Dialog open={showCreatePost} onOpenChange={setShowCreatePost}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("provider.content.createNewPost")}</DialogTitle></DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">{t("provider.content.captionLabel")}</label>
              <textarea
                value={newPostCaption}
                onChange={(e) => setNewPostCaption(e.target.value)}
                placeholder={t("provider.content.captionPlaceholder")}
                className="w-full min-h-24 p-3 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">{t("provider.content.photosLabel")}</label>
              <input type="file" accept="image/*" multiple onChange={handleImagesChange} disabled={newPostImages.length >= 4} className="w-full text-xs text-foreground" />
              {newPostImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {newPostImages.map((img, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                      <img src={img} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setNewPostImages(prev => prev.filter((_, idx) => idx !== i))} aria-label={t("common.removeItem")} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] flex items-center justify-center">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setShowCreatePost(false)} className="flex-1 bg-transparent">{t("common.cancel")}</Button>
              <Button onClick={handleCreatePost} disabled={isSaving || (!newPostCaption.trim() && newPostImages.length === 0)} className="flex-1 bg-primary hover:bg-primary/90">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : t("provider.content.createNewPost")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
