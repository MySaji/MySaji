"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { Dialog, DialogContent } from "@/frontend/components/ui/dialog"
import { Textarea } from "@/frontend/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/frontend/components/ui/popover"
import {
  Search, Heart, MessageCircle, Share2, Bookmark, MoreHorizontal,
  ImageIcon, Video, Users, TrendingUp, X, Send, MapPin, CheckCircle,
  Play, Plus, Camera, Smile, Hash, UserPlus, Loader2, Trash2, Flag
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { formatRelativeTime } from "@/backend/domain/format"
import {
  getPosts, getFollowingIds, getGroups, getTrendingTopics, getSuggestedUsers,
  toggleLike, toggleSave, toggleFollow, toggleJoinGroup,
  createPost, createGroup, deletePost, getComments, addComment, reportPost, reportComment,
  type PostItem, type GroupItem, type TrendingTopic, type SuggestedUser, type CommentItem,
} from "@/backend/actions/community"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import { getActiveProviderStories } from "@/backend/actions/provider-stories"
import { ProviderStoryRing } from "@/frontend/components/provider-story-ring"
import { useAuthContext } from "@/frontend/lib/auth-context"

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function CommunityPage() {
  const { t, tn } = useLocalization()
  const { user } = useAuthContext()
  const [activeTab, setActiveTab] = useState<"feed" | "trending" | "following" | "groups" | "saved">("feed")
  const [sort, setSort] = useState<"newest" | "discussed">("newest")
  const [mediaOnly, setMediaOnly] = useState(false)
  const [joinedOnly, setJoinedOnly] = useState(false)
  const [actionError, setActionError] = useState("")
  const [status, setStatus] = useState("")
  const [pending, setPending] = useState<string[]>([])
  const pendingRef = useRef(new Set<string>())
  const [postLocation, setPostLocation] = useState("")
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [postMenu, setPostMenu] = useState<string | null>(null)
  const [linkedPost, setLinkedPost] = useState<string | null>(null)
  useEffect(() => { setLinkedPost(new URLSearchParams(window.location.search).get("post")) }, [])
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; isVideo: boolean } | null>(null)
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [commentText, setCommentText] = useState("")
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [newPostText, setNewPostText] = useState("")
  const [newPostImages, setNewPostImages] = useState<string[]>([])
  const [newPostVideo, setNewPostVideo] = useState<string | null>(null)
  const [isPosting, setIsPosting] = useState(false)
  const [isReadingMedia, setIsReadingMedia] = useState(false)
  const mediaReadLock = useRef(false)
  const [groupName, setGroupName] = useState("")
  const [groupDescription, setGroupDescription] = useState("")
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // One SWR key per real data source instead of a single refreshAll() +
  // useEffect gate — gives request dedup (two components asking for the
  // same key within a tick share one fetch), stale-while-revalidate (the
  // feed you last saw shows instantly on return, refetching quietly behind
  // it instead of a blank spinner every time), and each panel can settle
  // independently rather than all waiting on the slowest of 5 real queries.
  const { data: postsData, isLoading, error: postsError, mutate: mutatePosts } = useSWR(user ? ["community-posts", user.id, linkedPost, activeTab === "saved"] : null, () => getPosts(linkedPost || undefined, activeTab === "saved"))
  const { data: followingIdsData, mutate: mutateFollowing } = useSWR(user ? ["community-following-ids", user.id] : null, getFollowingIds)
  const { data: groupsData, error: groupsError, mutate: mutateGroups } = useSWR(user ? ["community-groups", user.id] : null, getGroups)
  const { data: trendingTopicsData, mutate: mutateTrending } = useSWR(user ? ["community-trending", user.id] : null, getTrendingTopics)
  const { data: suggestedUsersData, mutate: mutateSuggested } = useSWR(user ? ["community-suggested-users", user.id] : null, getSuggestedUsers)
  const { data: providerStoryGroups } = useSWR(user ? ["provider-stories", user.id] : null, getActiveProviderStories, { refreshInterval: 60_000 })

  const posts = postsData ?? []
  const followingIds = followingIdsData ?? []
  const groups = groupsData ?? []
  const trendingTopics = trendingTopicsData ?? []
  const suggestedUsers = suggestedUsersData ?? []

  const getDisplayPosts = () => {
    const query = searchQuery.trim().toLowerCase()
    return posts.filter(post => (!query || `${post.content} ${post.authorName} ${post.location ?? ""}`.toLowerCase().includes(query))
      && (activeTab !== "following" || followingIds.includes(post.authorId))
      && (activeTab !== "saved" || post.isSaved)
      && (!mediaOnly || post.images.length > 0 || !!post.video))
      .sort((a, b) => activeTab === "trending" ? (b.likeCount + b.commentCount * 2) - (a.likeCount + a.commentCount * 2)
        : sort === "discussed" ? b.commentCount - a.commentCount : Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }

  const visibleGroups = groups.filter(group => (!joinedOnly || group.isJoined) && `${group.name} ${group.description}`.toLowerCase().includes(searchQuery.trim().toLowerCase()))
  const runAction = async (key: string, action: () => Promise<void>) => {
    if (pendingRef.current.has(key)) return
    pendingRef.current.add(key); setPending([...pendingRef.current]); setActionError("")
    try { await action() } catch (error) { setActionError(error instanceof Error ? error.message : "This action failed. Please try again.") }
    finally { pendingRef.current.delete(key); setPending([...pendingRef.current]) }
  }

  const handleToggleLike = (postId: string) => runAction(`like-${postId}`, async () => {
    const result = await toggleLike({ postId })
    if (!result.success) throw new Error(result.error)
    await mutatePosts(current => current?.map(post => post.id === postId ? { ...post, isLiked: result.isActive, likeCount: result.count } : post), { revalidate: false })
  })
  const handleToggleSave = (postId: string) => runAction(`save-${postId}`, async () => {
    const result = await toggleSave({ postId })
    if (!result.success) throw new Error(result.error)
    await mutatePosts(current => current?.map(post => post.id === postId ? { ...post, isSaved: result.isActive } : post), { revalidate: false })
    setStatus(result.isActive ? "Post saved. Find it in Saved posts." : "Post removed from saved posts.")
  })
  const handleToggleFollow = (userId: string) => runAction(`follow-${userId}`, async () => {
    const result = await toggleFollow({ userId })
    if (!result.success) throw new Error(result.error)
    await Promise.all([mutateFollowing(), mutateSuggested()])
  })
  const handleToggleJoinGroup = (groupId: string) => runAction(`group-${groupId}`, async () => {
    const result = await toggleJoinGroup({ groupId })
    if (!result.success) throw new Error(result.error)
    await mutateGroups()
  })
  const handleDeletePost = (postId: string) => runAction(`delete-${postId}`, async () => {
    const result = await deletePost({ postId })
    if (!result.success) throw new Error(result.error)
    await mutatePosts(current => current?.filter(post => post.id !== postId), { revalidate: false })
    setDeleteTarget(null); setStatus("Post deleted.")
  })
  const sharePost = (post: PostItem) => runAction(`share-${post.id}`, async () => {
    const url = `${location.origin}/customer/community?post=${encodeURIComponent(post.id)}`
    try {
      if (navigator.share) await navigator.share({ title: `A post by ${post.authorName}`, text: post.content.slice(0, 120), url })
      else { await navigator.clipboard.writeText(url); setStatus("Post link copied.") }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) throw new Error("Sharing is unavailable. Copy the page address from your browser instead.")
    }
  })

  const [reportingTarget, setReportingTarget] = useState<{ type: "post" | "comment"; id: string } | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [reportSubmitted, setReportSubmitted] = useState(false)

  const handleSubmitReport = async () => {
    if (!reportingTarget || reportReason.trim().length < 3 || isSubmittingReport) return
    setIsSubmittingReport(true); setActionError("")
    try {
      const result = reportingTarget.type === "post"
        ? await reportPost({ postId: reportingTarget.id, reason: reportReason.trim() })
        : await reportComment({ commentId: reportingTarget.id, reason: reportReason.trim() })
      if (!result.success) { setActionError(result.error); return }
      setReportSubmitted(true)
    } catch { setActionError("We couldn't send your report. Please try again.") }
    finally { setIsSubmittingReport(false) }
  }
  const handleCreatePost = async () => {
    if ((!newPostText.trim() && !newPostImages.length && !newPostVideo) || isPosting || isReadingMedia) return
    setIsPosting(true); setActionError("")
    try {
      const result = await createPost({ content: newPostText.trim(), images: newPostImages, video: newPostVideo || undefined, location: postLocation.trim() || undefined })
      if (!result.success) { setActionError(result.error); return }
      setNewPostText(""); setNewPostImages([]); setNewPostVideo(null); setPostLocation(""); setShowCreatePost(false)
      setActiveTab("feed"); setLinkedPost(null); if (linkedPost) window.history.replaceState(null, "", "/customer/community"); setSearchQuery(""); setMediaOnly(false); setStatus("Your post has been published.")
      await Promise.allSettled([mutatePosts(), mutateTrending()])
    } catch { setActionError("We couldn't confirm your post. Your draft is still here; refresh the feed before retrying.") }
    finally { setIsPosting(false) }
  }
  const handleImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []); event.target.value = ""
    if (!files.length || mediaReadLock.current || isPosting) return
    setShowCreatePost(true); setActionError("")
    if (files.length + newPostImages.length > 4 || files.some(file => !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) || file.size > 1024 * 1024)) {
      setActionError("Choose up to four JPG, PNG, WebP or GIF images, each no larger than 1 MB."); return
    }
    mediaReadLock.current = true; setIsReadingMedia(true)
    try { const images = await Promise.all(files.map(fileToDataUrl)); setNewPostImages(current => [...current, ...images].slice(0,4)) }
    catch { setActionError("We couldn't read that image. Please select it again.") }
    finally { mediaReadLock.current = false; setIsReadingMedia(false) }
  }
  const handleVideoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""
    if (!file || mediaReadLock.current || isPosting) return
    setShowCreatePost(true); setActionError("")
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type) || file.size > 3 * 1024 * 1024) { setActionError("Choose an MP4, WebM or MOV video up to 3 MB."); return }
    mediaReadLock.current = true; setIsReadingMedia(true)
    try { setNewPostVideo(await fileToDataUrl(file)) } catch { setActionError("We couldn't read that video. Please select it again.") }
    finally { mediaReadLock.current = false; setIsReadingMedia(false) }
  }
  const handleCreateGroup = async () => {
    if (!groupName.trim() || !groupDescription.trim() || isCreatingGroup) return
    setIsCreatingGroup(true); setActionError("")
    try {
      const result = await createGroup({ name: groupName.trim(), description: groupDescription.trim() })
      if (!result.success) { setActionError(result.error); return }
      setGroupName(""); setGroupDescription(""); setShowCreateGroup(false); setActiveTab("groups"); setStatus("Group created. You're its first member.")
      await mutateGroups().catch(() => setStatus("Group created. Refresh the group list to see it."))
    } catch { setActionError("We couldn't create the group. Your details have been kept.") }
    finally { setIsCreatingGroup(false) }
  }

  // Comments are keyed per-post ("comments", postId) so reopening a post you
  // already viewed this session shows the cached list instantly while SWR
  // quietly revalidates in the background — this is exactly the flow that
  // previously sat on a spinner for 20-75s under this session's DB latency.
  const { data: commentsData, error: commentsError, isLoading: isLoadingComments, mutate: mutateComments } = useSWR(
    commentsPostId && user ? ["comments", commentsPostId, user.id] : null,
    ([, postId]: [string, string]) => getComments(postId),
  )
  const comments = commentsData ?? []

  const openComments = (postId: string) => { setCommentsPostId(postId); setCommentText(""); setActionError("") }

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !commentsPostId || isSubmittingComment) return
    setIsSubmittingComment(true); setActionError("")
    try {
      const result = await addComment({ postId: commentsPostId, content: commentText.trim() })
      if (!result.success) { setActionError(result.error); return }
      setCommentText(""); await Promise.allSettled([mutateComments(), mutatePosts()])
    } catch { setActionError("We couldn't send the comment. Your text has been kept.") }
    finally { setIsSubmittingComment(false) }
  }

  const selectedPostForComments = posts.find(p => p.id === commentsPostId)

  const renderPostCard = (post: PostItem) => (
    <Card key={post.id} id={`post-${post.id}`} className="overflow-hidden rounded-2xl border-border shadow-none">
      {/* Post Header */}
      <div className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative w-12 h-12 rounded-full overflow-hidden">
            <Image src={post.authorAvatar || "/placeholder.svg"} alt={post.authorName} fill className="object-cover" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{post.authorName}</span>
              {post.authorVerified && <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-500" />}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{post.authorRole}</span>
              <span>-</span>
              <span>{formatRelativeTime(post.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!post.isMine && !followingIds.includes(post.authorId) && (
            <Button disabled={pending.includes(`follow-${post.authorId}`)} size="sm" variant="outline" onClick={() => handleToggleFollow(post.authorId)} className="text-[11px] bg-transparent">
              {t("customer.community.follow")}
            </Button>
          )}
          {post.isMine ? (
            <Popover open={postMenu === post.id} onOpenChange={open => setPostMenu(open ? post.id : null)}>
              <PopoverTrigger asChild>
                <button aria-label="Post options" className="p-3 hover:bg-muted rounded-full transition-colors">
                  <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-40 p-1">
                <button onClick={() => {setPostMenu(null);setDeleteTarget(post.id)}} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="w-3.5 h-3.5" />{t("customer.community.deletePost")}
                </button>
              </PopoverContent>
            </Popover>
          ) : (
            <Popover open={postMenu === post.id} onOpenChange={open => setPostMenu(open ? post.id : null)}>
              <PopoverTrigger asChild>
                <button aria-label="Post options" className="p-3 hover:bg-muted rounded-full transition-colors">
                  <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-40 p-1">
                <button onClick={() => {setPostMenu(null);setReportingTarget({ type: "post", id: post.id })}} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted">
                  <Flag className="w-3.5 h-3.5" />{t("customer.community.reportPost")}
                </button>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Post Content */}
      <div className="px-4 pb-3">
        <p className="break-words text-sm leading-7 text-foreground whitespace-pre-line sm:text-base">{post.content}</p>
        {post.location && (
          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{post.location}</span>
          </div>
        )}
      </div>

      {/* Post Media */}
      {post.images.length > 0 && (
        <div className={`grid gap-1 ${post.images.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.images.slice(0, 4).map((img, idx) => (
            <button
              key={idx}
              aria-label={`Open photo ${idx + 1} by ${post.authorName}`}
              onClick={() => setSelectedMedia({ url: img, isVideo: false })}
              className={`relative overflow-hidden group ${post.images.length === 1 ? 'aspect-video' : 'aspect-square'}`}
            >
              <Image src={img || "/placeholder.svg"} alt="" fill className="object-cover group-hover:scale-105 transition-transform" />
              {post.images.length > 4 && idx === 3 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white text-xl font-bold">+{post.images.length - 4}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {post.video && (
        <button
          aria-label={`Play video by ${post.authorName}`}
          onClick={() => setSelectedMedia({ url: post.video!, isVideo: true })}
          className="relative w-full aspect-video overflow-hidden group bg-black"
        >
          <video src={post.video} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/40 transition-colors">
            <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-8 h-8 text-foreground fill-foreground ml-1" />
            </div>
          </div>
        </button>
      )}

      {/* Post Actions */}
      <div className="p-4 flex items-center justify-between border-t border-border">
        <div className="flex items-center gap-2 sm:gap-5">
          <button
            onClick={() => handleToggleLike(post.id)}
            aria-label={`Like post by ${post.authorName}`} aria-pressed={post.isLiked} disabled={pending.includes(`like-${post.id}`)}
            className="flex min-h-11 items-center gap-2 text-muted-foreground hover:text-red-500 transition-colors"
          >
            <Heart className={`w-5 h-5 ${post.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
            <span className="text-xs">{post.likeCount}</span>
          </button>
          <button
            onClick={() => openComments(post.id)}
            aria-label={`Comments on post by ${post.authorName}`}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs">{post.commentCount}</span>
          </button>
          <button onClick={() => sharePost(post)} disabled={pending.includes(`share-${post.id}`)} aria-label={`Share post by ${post.authorName}`} className="flex min-h-11 items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <Share2 className="w-5 h-5" />
            <span className="hidden text-xs sm:inline">Share</span>
          </button>
        </div>
        <button
          onClick={() => handleToggleSave(post.id)}
          aria-label={post.isSaved ? "Unsave post" : "Save post"} aria-pressed={post.isSaved} disabled={pending.includes(`save-${post.id}`)}
          className="flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-primary transition-colors"
        >
          <Bookmark className={`w-5 h-5 ${post.isSaved ? 'fill-primary text-primary' : ''}`} />
        </button>
      </div>
    </Card>
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-background">
      {/* 6xl rather than 7xl, and the feed is centred within the space the
          sidebar does not use — at 7xl the 2xl feed sat hard against the left
          edge with a wide empty gap beside it on a desktop. */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 overflow-hidden rounded-2xl border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-5 border-l-4 border-orange-500 p-5 sm:p-7">
            <div className="max-w-xl"><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-800 dark:text-blue-300">The people behind the marketplace</p><h1 className="mb-3 text-3xl font-semibold tracking-tight">{t("customer.layout.navCommunity")}</h1><p className="text-sm leading-7 text-muted-foreground">Ask a practical question, share something you’ve learned or find people who care about the same things.</p></div>
            <Button className="min-h-11 bg-blue-800 text-white hover:bg-blue-900" onClick={() => setShowCreatePost(true)}><Plus size={17} />Create a post</Button>
          </div>
          <div className="grid grid-cols-3 divide-x border-t bg-muted/20 text-center"><div className="p-4"><p className="text-xl font-semibold">{followingIds.length}</p><p className="mt-1 text-xs text-muted-foreground">People you follow</p></div><div className="p-4"><p className="text-xl font-semibold">{groups.filter(group => group.isJoined).length}</p><p className="mt-1 text-xs text-muted-foreground">Groups joined</p></div><div className="p-4"><p className="text-xl font-semibold">{posts.filter(post => post.isSaved).length}</p><p className="mt-1 text-xs text-muted-foreground">Saved in loaded posts</p></div></div>
        </div>
        {actionError && <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{actionError}<button aria-label="Dismiss error" onClick={() => setActionError("")}><X size={18} /></button></div>}
        {status && <p role="status" className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{status}</p>}
        {(postsError || groupsError) && <Card className="mb-4 p-5"><p role="alert" className="text-sm">Some community content could not be loaded.</p><Button variant="outline" className="mt-3" onClick={() => {void mutatePosts();void mutateGroups()}}>Try again</Button></Card>}
        {linkedPost && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm"><p>{posts.length ? "Viewing a shared post." : "This shared post may have been removed or is no longer available."}</p><Button variant="outline" onClick={() => {setLinkedPost(null);window.history.replaceState(null,"", "/customer/community")}}>Back to community feed</Button></div>}

        {/* Tabs */}
        <nav aria-label="Community views" className="flex gap-2 mb-5 overflow-x-auto pb-2">
          {[
            { id: "feed", label: t("customer.community.tabFeed"), icon: Hash },
            { id: "trending", label: t("customer.community.tabTrending"), icon: TrendingUp },
            { id: "following", label: t("customer.community.tabFollowing"), icon: Users },
            { id: "groups", label: t("customer.community.tabGroups"), icon: Users },
            { id: "saved", label: "Saved posts", icon: Bookmark }
          ].map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                aria-pressed={activeTab === tab.id}
                className={`flex min-h-11 items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            )
          })}
        </nav>
        <Card className="mb-5 space-y-4 p-4"><div className="flex flex-wrap items-center gap-3"><div className="relative min-w-0 flex-1 basis-56"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label={activeTab === "groups" ? "Search community groups" : "Search community posts"} placeholder={activeTab === "groups" ? "Search groups by name or interest" : "Search posts, people or places"} value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="pl-10" /></div>{activeTab === "groups" ? <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={joinedOnly} onChange={event => setJoinedOnly(event.target.checked)} />My groups only</label> : <><select aria-label="Sort community posts" className="min-h-11 max-w-full rounded-lg border bg-background px-3 text-sm" value={sort} disabled={activeTab === "trending"} onChange={event => setSort(event.target.value as typeof sort)}><option value="newest">Newest first</option><option value="discussed">Most discussed</option></select><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={mediaOnly} onChange={event => setMediaOnly(event.target.checked)} />Photos & videos</label></>}{(searchQuery || mediaOnly || joinedOnly) && <button onClick={() => {setSearchQuery("");setMediaOnly(false);setJoinedOnly(false)}} className="min-h-11 text-sm text-blue-800 dark:text-blue-300">Clear filters</button>}</div>{trendingTopics.length > 0 && <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs"><span className="text-muted-foreground">Explore topics</span>{trendingTopics.slice(0,5).map(topic => <button key={topic.tag} onClick={() => {setSearchQuery(topic.tag);setActiveTab("feed")}} className="rounded-full bg-blue-50 px-3 py-2 font-medium text-blue-900">{topic.tag}</button>)}</div>}<p className="text-xs text-muted-foreground">{activeTab === "groups" ? `${visibleGroups.length} matching group(s)` : `${getDisplayPosts().length} matching post(s) · Search and saved filters apply to the loaded feed of up to 50 posts.`}{activeTab === "trending" && " Ranked by likes and comments in this feed."}</p></Card>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Main Content */}
          <div className="w-full min-w-0">
            {/* Create Post Card */}
            <Card className="p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-semibold">{user?.name?.charAt(0) || "Y"}</span>
                </div>
                <button
                  onClick={() => setShowCreatePost(true)}
                  className="flex-1 text-left px-4 py-2.5 bg-muted rounded-full text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  {t("customer.community.whatsOnYourMind")}
                </button>
              </div>
              <div className="flex items-center justify-around mt-4 pt-4 border-t border-border">
                <button onClick={() => imageInputRef.current?.click()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                  <ImageIcon className="w-5 h-5 text-green-500" />
                  <span className="text-xs">{t("customer.community.photo")}</span>
                </button>
                <button onClick={() => videoInputRef.current?.click()} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                  <Video className="w-5 h-5 text-red-500" />
                  <span className="text-xs">{t("customer.findSpecialists.video")}</span>
                </button>
                <button onClick={() => {setNewPostText(current => current || "I'd love some advice on ");setShowCreatePost(true)}} className="flex min-h-11 items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                  <MessageCircle className="w-5 h-5 text-blue-700" />
                  <span className="text-xs">Ask a question</span>
                </button>
              </div>
            </Card>

            {/* Work in Action — expiring before/after stories from providers,
                shown above the permanent post feed. */}
            {activeTab === "feed" && (providerStoryGroups ?? []).length > 0 && (
              <div className="mb-4">
                <h2 className="mb-3 text-sm font-bold text-foreground">{t("customer.home.workInActionTitle")}</h2>
                <ProviderStoryRing groups={providerStoryGroups ?? []} />
              </div>
            )}

            {/* Groups Tab */}
            {activeTab === "groups" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-semibold text-foreground">{t("customer.community.suggestedGroups")}</h2>
                  <Button variant="outline" size="sm" className="gap-2 bg-transparent" onClick={() => setShowCreateGroup(true)}>
                    <Plus className="w-4 h-4" />
                    {t("customer.community.createGroup")}
                  </Button>
                </div>
                {visibleGroups.length === 0 && (
                  <Card className="p-8 text-center"><p className="text-xs text-muted-foreground">{t("customer.community.noGroups")}</p></Card>
                )}
                {visibleGroups.map((group) => (
                  <Card key={group.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                      <Link href={`/customer/community/${group.id}`} className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                        <Image src={group.image || "/placeholder.svg"} alt={group.name} fill className="object-cover" />
                      </Link>
                      <Link href={`/customer/community/${group.id}`} className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground hover:text-primary transition-colors">{group.name}</h3>
                        <p className="text-xs text-muted-foreground">{tn("customer.community.membersCount", group.memberCount)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                      </Link>
                      <Button disabled={pending.includes(`group-${group.id}`)} variant={group.isJoined ? "secondary" : "default"} onClick={() => handleToggleJoinGroup(group.id)}>
                        {group.isJoined ? t("customer.community.joined") : t("customer.community.join")}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              /* Posts Feed */
              <div className="space-y-4">
                {getDisplayPosts().length > 0 ? (
                  getDisplayPosts().map(renderPostCard)
                ) : (
                  <Card className="p-12 text-center">
                    <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-base font-medium text-foreground mb-2">
                      {activeTab === "saved" ? "Your saved posts will appear here" : activeTab === "following" ? t("customer.community.noFollowingPosts") : t("customer.community.noPostsFound")}
                    </p>
                    <p className="text-muted-foreground">
                      {activeTab === "following" ? t("customer.community.followMoreHint") : t("customer.community.tryDifferentSearch")}
                    </p>
                  </Card>
                )}
              </div>
            )}
          </div>

          {/* Sidebar - Desktop Only */}
          <aside className="min-w-0 space-y-5" aria-label="Community discovery">
            <Card className="border-t-4 border-t-orange-500 p-5"><h2 className="text-base font-semibold">A useful, welcoming space</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Share honest experiences. Be respectful, protect private details and report scams or harmful content using a post’s options menu.</p><Link href="/terms" className="mt-3 inline-block text-sm font-medium text-blue-800 underline dark:text-blue-300">Community responsibilities</Link></Card>
            {/* Trending Topics */}
            <Card className="p-4">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                {t("customer.community.trendingTopics")}
              </h3>
              <div className="space-y-3">
                {trendingTopics.length === 0 && <p className="text-[11px] text-muted-foreground">{t("customer.community.noTrendingHashtags")}</p>}
                {trendingTopics.map((topic, idx) => (
                  <div key={idx} className="w-full flex items-center justify-between p-2 rounded-lg">
                    <div>
                      <span className="text-primary font-medium">{topic.tag}</span>
                      <p className="text-[11px] text-muted-foreground">{tn("customer.community.postsCount", topic.postCount)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Suggested Users */}
            <Card className="p-4">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                {t("customer.community.whoToFollow")}
              </h3>
              <div className="space-y-3">
                {suggestedUsers.length === 0 && <p className="text-[11px] text-muted-foreground">{t("customer.community.noSuggestions")}</p>}
                {suggestedUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-3">
                    <div className="relative w-10 h-10 rounded-full overflow-hidden">
                      {/* Images use the configured unoptimized rendering policy -- base64 data URLs aren't supported by next/image */}
                      <img src={user.avatar || "/placeholder.svg"} alt={user.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-xs truncate">{user.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.role}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled={pending.includes(`follow-${user.id}`)} className="text-[11px] bg-transparent" onClick={() => handleToggleFollow(user.id)}>
                      {followingIds.includes(user.id) ? t("customer.community.following") : t("customer.community.follow")}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            {/* Popular Groups */}
            <Card className="p-4">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                {t("customer.community.popularGroups")}
              </h3>
              <div className="space-y-3">
                {groups.slice(0, 3).map((group) => (
                  <div key={group.id} className="flex items-center gap-3">
                    <Link href={`/customer/community/${group.id}`} className="relative w-12 h-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                      <Image src={group.image || "/placeholder.svg"} alt={group.name} fill className="object-cover" />
                    </Link>
                    <Link href={`/customer/community/${group.id}`} className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-xs truncate hover:text-primary transition-colors">{group.name}</p>
                      <p className="text-[11px] text-muted-foreground">{tn("customer.community.membersCount", group.memberCount)}</p>
                    </Link>
                    <Button size="sm" variant={group.isJoined ? "secondary" : "outline"} disabled={pending.includes(`group-${group.id}`)} className="text-[11px] bg-transparent" onClick={() => handleToggleJoinGroup(group.id)}>
                      {group.isJoined ? t("customer.community.joined") : t("customer.community.join")}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      </div>

      <input type="file" ref={imageInputRef} onChange={handleImageSelection} className="hidden" accept="image/*" multiple />
      <input type="file" ref={videoInputRef} onChange={handleVideoSelection} className="hidden" accept="video/*" />

      {/* Create Post Modal */}
      <Dialog open={showCreatePost} onOpenChange={open => {if(!isPosting)setShowCreatePost(open)}}>
        <DialogContent showCloseButton={false} aria-label="Create a community post" className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">{t("customer.community.createPost")}</h3>
            <button aria-label="Close post editor" disabled={isPosting} onClick={() => setShowCreatePost(false)}>
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="py-4">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-semibold">Y</span>
              </div>
              <div>
                <p className="font-semibold text-foreground">{t("customer.community.you")}</p>
                <p className="text-[11px] text-muted-foreground">{t("customer.community.publicPost")}</p>
              </div>
            </div>
            <Textarea
              value={newPostText}
              onChange={(e) => setNewPostText(e.target.value)}
              placeholder={t("customer.community.whatsOnYourMind")}
              aria-label="Post text" maxLength={2000} disabled={isPosting} className="min-h-[150px] resize-y text-base"
            />
            <p className="mt-2 text-right text-xs text-muted-foreground">{newPostText.length}/2,000 characters</p>
            {newPostImages.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {newPostImages.map((image, index) => (
                  <div key={`${index}`} className="relative h-24 overflow-hidden rounded-xl">
                    <Image src={image} alt={`Selected photo ${index + 1}`} fill className="object-cover" /><button disabled={isPosting} aria-label={`Remove photo ${index + 1}`} onClick={() => setNewPostImages(current => current.filter((_,i) => i !== index))} className="absolute right-1 top-1 rounded-full bg-black/70 p-2 text-white"><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            {newPostVideo && (
              <div className="relative mt-4 overflow-hidden rounded-xl">
                <video src={newPostVideo} controls className="h-40 w-full object-cover" /><button disabled={isPosting} aria-label="Remove video" onClick={() => setNewPostVideo(null)} className="absolute right-2 top-2 rounded-full bg-black/70 p-2 text-white"><X size={16} /></button>
              </div>
            )}
            <div className="flex items-center gap-4 py-4 border-t border-border mt-4">
              <button aria-label="Attach photos" disabled={isPosting || isReadingMedia} onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-muted rounded-full transition-colors">
                <ImageIcon className="w-6 h-6 text-green-500" />
              </button>
              <button aria-label="Attach video" disabled={isPosting || isReadingMedia} onClick={() => videoInputRef.current?.click()} className="p-2 hover:bg-muted rounded-full transition-colors">
                <Video className="w-6 h-6 text-red-500" />
              </button>
              <button aria-label="Add a smile" disabled={isPosting} onClick={() => setNewPostText(text => `${text} \u{1F642}`.slice(0,2000))} className="rounded-full p-2 hover:bg-muted"><Smile className="h-6 w-6 text-orange-600" /></button>
            </div>
          </div>
          <div className="space-y-2"><label htmlFor="post-location" className="text-sm font-medium">Location (optional)</label><Input id="post-location" maxLength={150} disabled={isPosting} value={postLocation} onChange={event => setPostLocation(event.target.value)} placeholder="Area or town, without a private address" /><p className="text-xs leading-5 text-muted-foreground">Public post. Up to 4 photos, 1 MB each; video up to 3 MB. Keep personal and payment details private.</p></div>
          {isReadingMedia && <p role="status" className="text-sm text-muted-foreground">Preparing your media...</p>}
          {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
          <Button className="w-full" disabled={(!newPostText.trim() && newPostImages.length === 0 && !newPostVideo) || isPosting || isReadingMedia} onClick={handleCreatePost}>
            {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.community.postButton")}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent showCloseButton={false} aria-label="Create a community group" className="sm:max-w-lg">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">{t("customer.community.createGroup")}</h3>
            <button aria-label="Close group editor" onClick={() => setShowCreateGroup(false)}>
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-foreground">{t("customer.community.groupName")}</label>
              <Input aria-label="Group name" maxLength={100} value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("customer.community.groupNamePlaceholder")} />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-foreground">{t("customer.community.description")}</label>
              <Textarea aria-label="Group description" maxLength={1000} value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder={t("customer.community.groupDescriptionPlaceholder")} className="min-h-[100px]" />
            </div>
          </div>
          {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
          <Button className="w-full" disabled={!groupName.trim() || !groupDescription.trim() || isCreatingGroup} onClick={handleCreateGroup}>
            {isCreatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.community.createGroup")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Media Preview Modal */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent showCloseButton={false} aria-label="Post media preview" className="max-w-4xl p-0 bg-black overflow-hidden">
          <button
            aria-label="Close media preview" onClick={() => setSelectedMedia(null)}
            className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          {selectedMedia?.isVideo ? (
            <div className="aspect-video bg-black flex items-center justify-center relative">
              <video src={selectedMedia.url} controls autoPlay className="w-full h-full object-contain" />
            </div>
          ) : selectedMedia?.url && (
            <div className="aspect-video relative">
              <Image src={selectedMedia.url} alt="" fill className="object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Comments Modal */}
      <Dialog open={!!commentsPostId} onOpenChange={(open) => { if (!open && !isSubmittingComment) setCommentsPostId(null) }}>
        <DialogContent showCloseButton={false} aria-label="Post comments" className="max-w-lg p-0 overflow-hidden max-h-[85dvh]">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{t("customer.community.commentsCount", { count: selectedPostForComments?.commentCount ?? 0 })}</h3>
            <button disabled={isSubmittingComment} aria-label="Close comments" onClick={() => setCommentsPostId(null)}>
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
            {commentsError && <div role="alert" className="space-y-2 text-sm"><p>Comments could not be loaded.</p><Button variant="outline" onClick={() => void mutateComments()}>Retry comments</Button></div>}
            {isLoadingComments ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : comments.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{t("customer.community.noComments")}</p>
            ) : comments.map(comment => (
              <div key={comment.id} className="flex gap-3">
                <div className="relative w-10 h-10 rounded-full bg-muted flex-shrink-0 overflow-hidden">
                  <Image src={comment.authorAvatar || "/placeholder.svg"} alt="" fill className="object-cover" />
                </div>
                <div className="flex-1">
                  <div className="bg-muted rounded-xl p-3">
                    <p className="font-medium text-xs text-foreground">{comment.authorName}</p>
                    <p className="text-xs text-muted-foreground mt-1">{comment.content}</p>
                  </div>
                  <div className="flex items-center gap-4 mt-2 px-2">
                    <span className="text-[11px] text-muted-foreground">{formatRelativeTime(comment.createdAt)}</span>
                    {!comment.isMine && (
                      <button
                        onClick={() => setReportingTarget({ type: "comment", id: comment.id })}
                        className="text-[11px] text-muted-foreground hover:text-red-600 flex items-center gap-1"
                      >
                        <Flag className="w-3 h-3" />{t("customer.community.report")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {actionError && <p role="alert" className="px-4 text-sm text-red-700">{actionError}</p>}
          <div className="p-4 border-t border-border">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center">
                <span className="text-primary font-semibold text-xs">Y</span>
              </div>
              <div className="min-w-0 flex-1 flex gap-2">
                <Input
                  aria-label="Write a comment" maxLength={2000} placeholder={t("customer.community.writeComment")}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && handleSubmitComment()}
                  className="flex-1"
                />
                <Button aria-label="Send comment" size="icon" disabled={!commentText.trim() || isSubmittingComment} onClick={handleSubmitComment}>
                  {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={open => {if(!open)setDeleteTarget(null)}}><DialogContent aria-label="Delete community post"><h2 className="text-lg font-semibold">Delete this post?</h2><p className="text-sm leading-6 text-muted-foreground">This removes the post and its discussion. This action cannot be undone.</p>{actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}<div className="flex gap-3"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Keep post</Button><Button variant="destructive" disabled={!!deleteTarget && pending.includes(`delete-${deleteTarget}`)} onClick={() => deleteTarget && handleDeletePost(deleteTarget)}>Delete post</Button></div></DialogContent></Dialog>
      {/* Report Post / Comment */}
      <Dialog open={!!reportingTarget} onOpenChange={(open) => { if (!open) { setReportingTarget(null); setReportReason(""); setReportSubmitted(false) } }}>
        <DialogContent className="max-w-sm">
          {reportSubmitted ? (
            <div className="text-center py-6">
              <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <p className="font-semibold text-foreground">{t("customer.community.reportSubmitted")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("customer.community.moderationReviewNotice")}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Flag className="w-4 h-4 text-red-500" />
                  {reportingTarget?.type === "comment" ? t("customer.community.reportCommentTitle") : t("customer.community.reportPostTitle")}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{reportingTarget?.type === "comment" ? t("customer.community.reportCommentHint") : t("customer.community.reportPostHint")}</p>
              <Textarea
                aria-label="Report reason" maxLength={300} value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder={t("customer.community.reportReasonPlaceholder")}
                className="min-h-[80px] mb-3"
              />
              {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setReportingTarget(null)}>{t("common.cancel")}</Button>
                <Button className="flex-1" onClick={handleSubmitReport} disabled={reportReason.trim().length < 3 || isSubmittingReport}>
                  {isSubmittingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.community.submitReport")}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
