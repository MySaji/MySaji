"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { Card } from "@/frontend/components/ui/card"
import { Button } from "@/frontend/components/ui/button"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/frontend/components/ui/dialog"
import {
  ArrowLeft, Users, ImagePlus, X, Heart, MessageCircle, Loader2, Trash2, Send, Shield, LogOut,
} from "lucide-react"
import { formatRelativeTime } from "@/backend/domain/format"
import {
  getGroupDetail, getGroupMembers, getGroupPosts, createGroupPost, toggleGroupPostLike,
  getGroupPostComments, addGroupPostComment, deleteGroupPost, deleteGroup, toggleJoinGroup,
  type GroupDetail, type GroupMemberItem, type GroupPostItem, type GroupCommentItem,
} from "@/backend/actions/community"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"

export default function GroupDetailPage() {
  const { t, tn } = useLocalization()
  const params = useParams<{ groupId: string }>()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [group, setGroup] = useState<GroupDetail>(null)
  const [posts, setPosts] = useState<GroupPostItem[]>([])
  const [showMembers, setShowMembers] = useState(false)
  const [members, setMembers] = useState<GroupMemberItem[]>([])

  const [postText, setPostText] = useState("")
  const [postImages, setPostImages] = useState<string[]>([])
  const [isPosting, setIsPosting] = useState(false)

  const [commentsPostId, setCommentsPostId] = useState<string | null>(null)
  const [comments, setComments] = useState<GroupCommentItem[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState("")
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)

  const refresh = async () => {
    const [g, p] = await Promise.all([getGroupDetail(params.groupId), getGroupPosts(params.groupId)])
    setGroup(g)
    setPosts(p)
  }

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.groupId])

  const handleToggleJoin = async () => {
    await toggleJoinGroup({ groupId: params.groupId })
    await refresh()
  }

  const handleDeleteGroup = async () => {
    if (!confirm(t("customer.groupDetail.confirmDeleteGroup"))) return
    const result = await deleteGroup({ groupId: params.groupId })
    if (!result.success) { alert(result.error); return }
    router.push("/customer/community")
  }

  const openMembers = async () => {
    setShowMembers(true)
    setMembers(await getGroupMembers(params.groupId))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4 - postImages.length)
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onloadend = () => setPostImages((prev) => [...prev, reader.result as string])
      reader.readAsDataURL(file)
    })
  }

  const handleCreatePost = async () => {
    if (!postText.trim() && postImages.length === 0) return
    setIsPosting(true)
    const result = await createGroupPost({ groupId: params.groupId, content: postText.trim(), images: postImages })
    setIsPosting(false)
    if (!result.success) { alert(result.error); return }
    setPostText("")
    setPostImages([])
    await refresh()
  }

  const handleToggleLike = async (postId: string) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, isLiked: !p.isLiked, likeCount: p.likeCount + (p.isLiked ? -1 : 1) } : p))
    const result = await toggleGroupPostLike({ groupPostId: postId })
    if (result.success) {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, isLiked: result.isActive, likeCount: result.count } : p))
    } else {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, isLiked: !p.isLiked, likeCount: p.likeCount + (p.isLiked ? -1 : 1) } : p))
    }
  }

  const handleDeletePost = async (postId: string) => {
    if (!confirm(t("customer.groupDetail.confirmDeletePost"))) return
    await deleteGroupPost({ groupPostId: postId })
    await refresh()
  }

  const openComments = async (postId: string) => {
    setCommentsPostId(postId)
    setIsLoadingComments(true)
    setComments(await getGroupPostComments(postId))
    setIsLoadingComments(false)
  }

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !commentsPostId) return
    setIsSubmittingComment(true)
    const result = await addGroupPostComment({ groupPostId: commentsPostId, content: commentText.trim() })
    setIsSubmittingComment(false)
    if (!result.success) { alert(result.error); return }
    setCommentText("")
    setComments(await getGroupPostComments(commentsPostId))
    setPosts((prev) => prev.map((p) => p.id === commentsPostId ? { ...p, commentCount: p.commentCount + 1 } : p))
  }

  const selectedPostForComments = posts.find((p) => p.id === commentsPostId)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-background">
        <p className="text-muted-foreground">{t("customer.groupDetail.notFound")}</p>
        <Button variant="outline" onClick={() => router.push("/customer/community")}>{t("customer.groupDetail.backToCommunity")}</Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 bg-background min-h-screen">
      <button onClick={() => router.push("/customer/community")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> {t("customer.groupDetail.backToCommunity")}
      </button>

      <Card className="overflow-hidden mb-4">
        <div className="relative h-32 bg-muted">
          <Image src={group.image || "/placeholder.svg"} alt={group.name} fill className="object-cover" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-foreground truncate">{group.name}</h1>
              <button onClick={openMembers} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 mt-0.5">
                <Users className="w-3.5 h-3.5" /> {tn("customer.community.membersCount", group.memberCount)}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {group.isJoined && group.isAdmin && (
                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5" onClick={handleDeleteGroup}>
                  <Trash2 className="w-3.5 h-3.5" /> {t("common.delete")}
                </Button>
              )}
              <Button size="sm" variant={group.isJoined ? "secondary" : "default"} className="gap-1.5" onClick={handleToggleJoin}>
                {group.isJoined ? <><LogOut className="w-3.5 h-3.5" /> {t("customer.groupDetail.leave")}</> : t("customer.community.join")}
              </Button>
            </div>
          </div>
          {group.description && <p className="text-xs text-muted-foreground mt-3">{group.description}</p>}
        </div>
      </Card>

      {group.isJoined ? (
        <Card className="p-4 mb-4">
          <Textarea
            placeholder={t("customer.groupDetail.shareWithGroup", { name: group.name })}
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            className="resize-none border-0 focus-visible:ring-0 p-0 min-h-[60px]"
          />
          {postImages.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              {postImages.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                  <Image src={img} alt="" fill className="object-cover" />
                  <button onClick={() => setPostImages((prev) => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <label className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer text-xs">
              <ImagePlus className="w-4 h-4" /> {t("customer.community.photo")}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={postImages.length >= 4} />
            </label>
            <Button size="sm" disabled={(!postText.trim() && postImages.length === 0) || isPosting} onClick={handleCreatePost}>
              {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.community.postButton")}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4 mb-4 text-center text-xs text-muted-foreground">
          {t("customer.groupDetail.joinToPost")}
        </Card>
      )}

      <div className="space-y-4">
        {posts.length === 0 ? (
          <Card className="p-10 text-center">
            <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">{t("customer.groupDetail.noPostsYet")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("customer.groupDetail.beFirstToShare")}</p>
          </Card>
        ) : posts.map((post) => (
          <Card key={post.id} className="overflow-hidden">
            <div className="p-4 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted flex-shrink-0">
                  <Image src={post.authorAvatar || "/placeholder.svg"} alt={post.authorName} fill className="object-cover" />
                </div>
                <div>
                  <p className="font-semibold text-foreground text-xs">{post.authorName}</p>
                  <p className="text-[11px] text-muted-foreground">{formatRelativeTime(post.createdAt)}</p>
                </div>
              </div>
              {post.isMine && (
                <button onClick={() => handleDeletePost(post.id)} className="p-1.5 text-muted-foreground hover:text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {post.content && <p className="px-4 pb-3 text-foreground whitespace-pre-line">{post.content}</p>}

            {post.images.length > 0 && (
              <div className={`grid gap-1 ${post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                {post.images.slice(0, 4).map((img, idx) => (
                  <div key={idx} className={`relative overflow-hidden ${post.images.length === 1 ? "aspect-video" : "aspect-square"}`}>
                    <Image src={img || "/placeholder.svg"} alt="" fill className="object-cover" />
                  </div>
                ))}
              </div>
            )}

            <div className="p-4 flex items-center gap-6 border-t border-border">
              <button onClick={() => handleToggleLike(post.id)} className="flex items-center gap-2 text-muted-foreground hover:text-red-500 transition-colors">
                <Heart className={`w-5 h-5 ${post.isLiked ? "fill-red-500 text-red-500" : ""}`} />
                <span className="text-xs">{post.likeCount}</span>
              </button>
              <button onClick={() => openComments(post.id)} className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
                <MessageCircle className="w-5 h-5" />
                <span className="text-xs">{post.commentCount}</span>
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Members Dialog */}
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{t("customer.groupDetail.membersCount", { count: members.length })}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto py-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="relative w-9 h-9 rounded-full overflow-hidden bg-muted flex-shrink-0">
                  <Image src={m.avatar || "/placeholder.svg"} alt={m.name} fill className="object-cover" />
                </div>
                <p className="flex-1 text-xs font-medium text-foreground truncate">{m.name}</p>
                {m.isAdmin && <span className="flex items-center gap-1 text-[11px] text-primary font-medium"><Shield className="w-3 h-3" /> {t("customer.groupDetail.admin")}</span>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Comments Dialog */}
      <Dialog open={!!commentsPostId} onOpenChange={(open) => { if (!open) setCommentsPostId(null) }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[80vh]">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{t("customer.community.commentsCount", { count: selectedPostForComments?.commentCount ?? 0 })}</h3>
            <button onClick={() => setCommentsPostId(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
          </div>
          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
            {isLoadingComments ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{t("customer.community.noComments")}</p>
            ) : comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                <div className="relative w-10 h-10 rounded-full bg-muted flex-shrink-0 overflow-hidden">
                  <Image src={comment.authorAvatar || "/placeholder.svg"} alt="" fill className="object-cover" />
                </div>
                <div className="flex-1">
                  <div className="bg-muted rounded-xl p-3">
                    <p className="font-medium text-xs text-foreground">{comment.authorName}</p>
                    <p className="text-xs text-muted-foreground mt-1">{comment.content}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground px-2">{formatRelativeTime(comment.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border">
            <div className="flex gap-2">
              <Input
                placeholder={t("customer.community.writeComment")}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmitComment()}
                className="flex-1"
              />
              <Button size="icon" disabled={!commentText.trim() || isSubmittingComment} onClick={handleSubmitComment}>
                {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
