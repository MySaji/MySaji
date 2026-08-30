"use client"

import { useRef, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Search, Heart, MessageCircle, Share2, Bookmark, MoreHorizontal,
  ImageIcon, Video, Users, TrendingUp, X, Send, MapPin, CheckCircle,
  Play, Plus, Camera, Smile, Hash, UserPlus, Loader2, Trash2, Flag
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { formatRelativeTime } from "@/lib/format"
import {
  getPosts, getFollowingIds, getGroups, getTrendingTopics, getSuggestedUsers,
  toggleLike, toggleSave, toggleFollow, toggleJoinGroup,
  createPost, createGroup, deletePost, getComments, addComment, reportPost, reportComment,
  type PostItem, type GroupItem, type TrendingTopic, type SuggestedUser, type CommentItem,
} from "@/lib/actions/community"
import { useLocalization } from "@/lib/hooks/useLocalization"

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
  const [activeTab, setActiveTab] = useState<"feed" | "trending" | "following" | "groups">("feed")
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
  const { data: postsData, isLoading, mutate: mutatePosts } = useSWR("community-posts", getPosts)
  const { data: followingIdsData, mutate: mutateFollowing } = useSWR("community-following-ids", getFollowingIds)
  const { data: groupsData, mutate: mutateGroups } = useSWR("community-groups", getGroups)
  const { data: trendingTopicsData, mutate: mutateTrending } = useSWR("community-trending", getTrendingTopics)
  const { data: suggestedUsersData, mutate: mutateSuggested } = useSWR("community-suggested-users", getSuggestedUsers)

  const posts = postsData ?? []
  const followingIds = followingIdsData ?? []
  const groups = groupsData ?? []
  const trendingTopics = trendingTopicsData ?? []
  const suggestedUsers = suggestedUsersData ?? []

  const trendingPosts = posts.filter(p => p.likeCount > 100)
  const followingPosts = posts.filter(p => followingIds.includes(p.authorId))
  const filteredPosts = posts.filter(post =>
    post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.authorName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getDisplayPosts = () => {
    switch (activeTab) {
      case "trending": return trendingPosts
      case "following": return followingPosts
      default: return filteredPosts
    }
  }

  // Optimistic update + reconcile-or-rollback pattern, applied consistently
  // across every toggle: update the local SWR cache immediately (no
  // network wait), then correct it with the server's real return value once
  // the round trip lands. If the real call fails, `mutate()` with no
  // arguments forces a genuine refetch, so the UI can never get stuck
  // showing an optimistic guess that never actually happened server-side.
  const handleToggleLike = async (postId: string) => {
    mutatePosts(
      (current) => current?.map(p => p.id === postId ? { ...p, isLiked: !p.isLiked, likeCount: p.likeCount + (p.isLiked ? -1 : 1) } : p),
      { revalidate: false },
    )
    const result = await toggleLike({ postId })
    if (result.success) {
      mutatePosts((current) => current?.map(p => p.id === postId ? { ...p, isLiked: result.isActive, likeCount: result.count } : p), { revalidate: false })
    } else {
      mutatePosts()
    }
  }

  const handleToggleSave = async (postId: string) => {
    mutatePosts((current) => current?.map(p => p.id === postId ? { ...p, isSaved: !p.isSaved } : p), { revalidate: false })
    const result = await toggleSave({ postId })
    if (!result.success) mutatePosts()
  }

  const handleToggleFollow = async (userId: string) => {
    mutateFollowing((current) => current?.includes(userId) ? current.filter(id => id !== userId) : [...(current ?? []), userId], { revalidate: false })
    const result = await toggleFollow({ userId })
    if (result.success) {
      mutatePosts((current) => current?.map(p => p.authorId === userId ? { ...p, authorFollowers: result.count } : p), { revalidate: false })
      mutateSuggested((current) => current?.map(u => u.id === userId ? { ...u, followerCount: result.count } : u), { revalidate: false })
    } else {
      mutateFollowing()
    }
  }

  const handleToggleJoinGroup = async (groupId: string) => {
    mutateGroups(
      (current) => current?.map(g => g.id === groupId ? { ...g, isJoined: !g.isJoined, memberCount: g.memberCount + (g.isJoined ? -1 : 1) } : g),
      { revalidate: false },
    )
    const result = await toggleJoinGroup({ groupId })
    if (!result.success) mutateGroups()
  }

  const handleDeletePost = async (postId: string) => {
    mutatePosts((current) => current?.filter(p => p.id !== postId), { revalidate: false })
    await deletePost({ postId })
  }

  const [reportingTarget, setReportingTarget] = useState<{ type: "post" | "comment"; id: string } | null>(null)
  const [reportReason, setReportReason] = useState("")
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  const [reportSubmitted, setReportSubmitted] = useState(false)

  const handleSubmitReport = async () => {
    if (!reportingTarget || reportReason.trim().length < 3) return
    setIsSubmittingReport(true)
    const result = reportingTarget.type === "post"
      ? await reportPost({ postId: reportingTarget.id, reason: reportReason.trim() })
      : await reportComment({ commentId: reportingTarget.id, reason: reportReason.trim() })
    setIsSubmittingReport(false)
    if (result.success) {
      setReportSubmitted(true)
      setTimeout(() => { setReportingTarget(null); setReportReason(""); setReportSubmitted(false) }, 1500)
    }
  }

  const handleCreatePost = async () => {
    if (!newPostText.trim() && newPostImages.length === 0 && !newPostVideo) return
    setIsPosting(true)
    const result = await createPost({ content: newPostText.trim(), images: newPostImages, video: newPostVideo || undefined, location: "Nairobi, Kenya" })
    setIsPosting(false)
    if (!result.success) return
    setNewPostText("")
    setNewPostImages([])
    setNewPostVideo(null)
    setShowCreatePost(false)
    // A new post can change hashtag frequency, so trending needs a real
    // refetch too — everything else (following list, groups, suggestions)
    // is untouched by creating a post and doesn't need to be re-fetched.
    mutatePosts()
    mutateTrending()
  }

  const handleImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).slice(0, 4)
    event.target.value = ""
    if (files.length === 0) return
    const dataUrls = await Promise.all(files.map(fileToDataUrl))
    setNewPostImages(prev => [...prev, ...dataUrls].slice(0, 4))
  }

  const handleVideoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setNewPostVideo(await fileToDataUrl(file))
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim() || !groupDescription.trim()) return
    setIsCreatingGroup(true)
    const result = await createGroup({ name: groupName.trim(), description: groupDescription.trim() })
    setIsCreatingGroup(false)
    if (!result.success) return
    setGroupName("")
    setGroupDescription("")
    setShowCreateGroup(false)
    mutateGroups()
  }

  // Comments are keyed per-post ("comments", postId) so reopening a post you
  // already viewed this session shows the cached list instantly while SWR
  // quietly revalidates in the background — this is exactly the flow that
  // previously sat on a spinner for 20-75s under this session's DB latency.
  const { data: commentsData, isLoading: isLoadingComments, mutate: mutateComments } = useSWR(
    commentsPostId ? ["comments", commentsPostId] : null,
    ([, postId]: [string, string]) => getComments(postId),
  )
  const comments = commentsData ?? []

  const openComments = (postId: string) => setCommentsPostId(postId)

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !commentsPostId) return
    const postId = commentsPostId
    const optimisticComment: CommentItem = {
      id: `optimistic-${Date.now()}`,
      authorName: t("customer.community.you"),
      authorAvatar: null,
      content: commentText.trim(),
      createdAt: new Date().toISOString(),
      isMine: true,
    }
    setIsSubmittingComment(true)
    setCommentText("")
    mutateComments((current) => [...(current ?? []), optimisticComment], { revalidate: false })
    mutatePosts((current) => current?.map(p => p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p), { revalidate: false })
    const result = await addComment({ postId, content: optimisticComment.content })
    setIsSubmittingComment(false)
    if (!result.success) {
      mutateComments()
      mutatePosts()
      return
    }
    // Replace the optimistic entry with the real, server-confirmed list
    // (real id, real createdAt) rather than trusting the local guess forever.
    mutateComments()
  }

  const selectedPostForComments = posts.find(p => p.id === commentsPostId)

  const PostCard = ({ post }: { post: PostItem }) => (
    <Card className="overflow-hidden">
      {/* Post Header */}
      <div className="p-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="relative w-12 h-12 rounded-full overflow-hidden">
            <Image src={post.authorAvatar || "/placeholder.svg"} alt={post.authorName} fill className="object-cover" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">{post.authorName}</span>
              {post.authorVerified && <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-500" />}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{post.authorRole}</span>
              <span>-</span>
              <span>{formatRelativeTime(post.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!post.isMine && !followingIds.includes(post.authorId) && (
            <Button size="sm" variant="outline" onClick={() => handleToggleFollow(post.authorId)} className="text-[11px] bg-transparent">
              {t("customer.community.follow")}
            </Button>
          )}
          {post.isMine ? (
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-2 hover:bg-muted rounded-full transition-colors">
                  <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-40 p-1">
                <button onClick={() => handleDeletePost(post.id)} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Trash2 className="w-3.5 h-3.5" />{t("customer.community.deletePost")}
                </button>
              </PopoverContent>
            </Popover>
          ) : (
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-2 hover:bg-muted rounded-full transition-colors">
                  <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-40 p-1">
                <button onClick={() => setReportingTarget({ type: "post", id: post.id })} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted">
                  <Flag className="w-3.5 h-3.5" />{t("customer.community.reportPost")}
                </button>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Post Content */}
      <div className="px-4 pb-3">
        <p className="text-foreground whitespace-pre-line">{post.content}</p>
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
        <div className="flex items-center gap-6">
          <button
            onClick={() => handleToggleLike(post.id)}
            className="flex items-center gap-2 text-muted-foreground hover:text-red-500 transition-colors"
          >
            <Heart className={`w-5 h-5 ${post.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
            <span className="text-xs">{post.likeCount}</span>
          </button>
          <button
            onClick={() => openComments(post.id)}
            className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs">{post.commentCount}</span>
          </button>
          <button className="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
            <Share2 className="w-5 h-5" />
            <span className="text-xs">{post.shareCount}</span>
          </button>
        </div>
        <button
          onClick={() => handleToggleSave(post.id)}
          className="text-muted-foreground hover:text-primary transition-colors"
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
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl lg:text-2xl font-bold text-foreground mb-2">{t("customer.layout.navCommunity")}</h1>
          <p className="text-muted-foreground">{t("customer.community.subtitle")}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: "feed", label: t("customer.community.tabFeed"), icon: Hash },
            { id: "trending", label: t("customer.community.tabTrending"), icon: TrendingUp },
            { id: "following", label: t("customer.community.tabFollowing"), icon: Users },
            { id: "groups", label: t("customer.community.tabGroups"), icon: Users }
          ].map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
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
        </div>

        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1 max-w-2xl">
            {/* Create Post Card */}
            <Card className="p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-primary font-semibold">Y</span>
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
                <button className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                  <Camera className="w-5 h-5 text-blue-500" />
                  <span className="text-xs">{t("customer.community.live")}</span>
                </button>
              </div>
            </Card>

            {/* Search */}
            {activeTab === "feed" && (
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input
                    placeholder={t("customer.community.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
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
                {groups.length === 0 && (
                  <Card className="p-8 text-center"><p className="text-xs text-muted-foreground">{t("customer.community.noGroups")}</p></Card>
                )}
                {groups.map((group) => (
                  <Card key={group.id} className="p-4">
                    <div className="flex items-center gap-4">
                      <Link href={`/customer/community/${group.id}`} className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted flex-shrink-0">
                        <Image src={group.image || "/placeholder.svg"} alt={group.name} fill className="object-cover" />
                      </Link>
                      <Link href={`/customer/community/${group.id}`} className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground hover:text-primary transition-colors">{group.name}</h3>
                        <p className="text-xs text-muted-foreground">{tn("customer.community.membersCount", group.memberCount)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{group.description}</p>
                      </Link>
                      <Button variant={group.isJoined ? "secondary" : "default"} onClick={() => handleToggleJoinGroup(group.id)}>
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
                  getDisplayPosts().map(post => <PostCard key={post.id} post={post} />)
                ) : (
                  <Card className="p-12 text-center">
                    <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-base font-medium text-foreground mb-2">
                      {activeTab === "following" ? t("customer.community.noFollowingPosts") : t("customer.community.noPostsFound")}
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
          <aside className="hidden lg:block w-80 space-y-6">
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
                      {/* eslint-disable-next-line @next/next/no-img-element -- base64 data URLs aren't supported by next/image */}
                      <img src={user.avatar || "/placeholder.svg"} alt={user.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-xs truncate">{user.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.role}</p>
                    </div>
                    <Button size="sm" variant="outline" className="text-[11px] bg-transparent" onClick={() => handleToggleFollow(user.id)}>
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
                    <Button size="sm" variant={group.isJoined ? "secondary" : "outline"} className="text-[11px] bg-transparent" onClick={() => handleToggleJoinGroup(group.id)}>
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
      <Dialog open={showCreatePost} onOpenChange={setShowCreatePost}>
        <DialogContent className="max-w-lg">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">{t("customer.community.createPost")}</h3>
            <button onClick={() => setShowCreatePost(false)}>
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
              className="min-h-[150px] border-0 resize-none focus-visible:ring-0 text-base"
            />
            {newPostImages.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {newPostImages.map((image, index) => (
                  <div key={`${index}`} className="relative h-24 overflow-hidden rounded-xl">
                    <Image src={image} alt="Selected preview" fill className="object-cover" />
                  </div>
                ))}
              </div>
            )}
            {newPostVideo && (
              <div className="mt-4 overflow-hidden rounded-xl">
                <video src={newPostVideo} controls className="h-40 w-full object-cover" />
              </div>
            )}
            <div className="flex items-center gap-4 py-4 border-t border-border mt-4">
              <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-muted rounded-full transition-colors">
                <ImageIcon className="w-6 h-6 text-green-500" />
              </button>
              <button onClick={() => videoInputRef.current?.click()} className="p-2 hover:bg-muted rounded-full transition-colors">
                <Video className="w-6 h-6 text-red-500" />
              </button>
              <button className="p-2 hover:bg-muted rounded-full transition-colors">
                <MapPin className="w-6 h-6 text-blue-500" />
              </button>
              <button className="p-2 hover:bg-muted rounded-full transition-colors">
                <Smile className="w-6 h-6 text-yellow-500" />
              </button>
            </div>
          </div>
          <Button className="w-full" disabled={(!newPostText.trim() && newPostImages.length === 0 && !newPostVideo) || isPosting} onClick={handleCreatePost}>
            {isPosting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.community.postButton")}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateGroup} onOpenChange={setShowCreateGroup}>
        <DialogContent className="max-w-lg">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="text-base font-semibold text-foreground">{t("customer.community.createGroup")}</h3>
            <button onClick={() => setShowCreateGroup(false)}>
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-foreground">{t("customer.community.groupName")}</label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("customer.community.groupNamePlaceholder")} />
            </div>
            <div>
              <label className="mb-2 block text-xs font-medium text-foreground">{t("customer.community.description")}</label>
              <Textarea value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder={t("customer.community.groupDescriptionPlaceholder")} className="min-h-[100px]" />
            </div>
          </div>
          <Button className="w-full" disabled={!groupName.trim() || !groupDescription.trim() || isCreatingGroup} onClick={handleCreateGroup}>
            {isCreatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : t("customer.community.createGroup")}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Media Preview Modal */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black overflow-hidden">
          <button
            onClick={() => setSelectedMedia(null)}
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
      <Dialog open={!!commentsPostId} onOpenChange={(open) => { if (!open) setCommentsPostId(null) }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden max-h-[80vh]">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{t("customer.community.commentsCount", { count: selectedPostForComments?.commentCount ?? 0 })}</h3>
            <button onClick={() => setCommentsPostId(null)}>
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
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

          <div className="p-4 border-t border-border">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center">
                <span className="text-primary font-semibold text-xs">Y</span>
              </div>
              <div className="flex-1 flex gap-2">
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
          </div>
        </DialogContent>
      </Dialog>

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
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder={t("customer.community.reportReasonPlaceholder")}
                className="min-h-[80px] mb-3"
              />
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
