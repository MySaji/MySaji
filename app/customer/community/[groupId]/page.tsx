"use client"

import { useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import useSWR from "swr"
import useSWRInfinite from "swr/infinite"
import {
  ArrowLeft,
  Users,
  ImagePlus,
  X,
  Heart,
  MessageCircle,
  Loader2,
  Trash2,
  Send,
  Shield,
  Share2,
  Search,
  Settings2,
} from "lucide-react"
import { Button } from "@/frontend/components/ui/button"
import { Card } from "@/frontend/components/ui/card"
import { Input } from "@/frontend/components/ui/input"
import { Textarea } from "@/frontend/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/frontend/components/ui/dialog"
import { formatRelativeTime } from "@/backend/domain/format"
import { useAuthContext } from "@/frontend/lib/auth-context"
import {
  getGroupDetail,
  getGroupMembers,
  getGroupPosts,
  createGroupPost,
  toggleGroupPostLike,
  getGroupPostComments,
  addGroupPostComment,
  deleteGroupPost,
  deleteGroup,
  toggleJoinGroup,
  updateMyCommunityGroup,
  type GroupPostItem,
} from "@/backend/actions/community"

type Outcome = { success: boolean; error?: string }
const imageData = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

export default function GroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>(),
    { user, isLoading: authLoading } = useAuthContext()
  const {
    data: group,
    error: groupError,
    isLoading,
    mutate: refreshGroup,
  } = useSWR(user && groupId ? ["community-group", groupId, user.id] : null, () => getGroupDetail(groupId))
  const {
    data: pages,
    error: postsError,
    isValidating: refreshing,
    mutate: refreshPosts,
    size,
    setSize,
  } = useSWRInfinite<GroupPostItem[]>(
    (index, previous) =>
      !user || !groupId || (index > 0 && (!previous || previous.length < 31))
        ? null
        : [
            "community-group-posts-v2",
            groupId,
            user.id,
            index,
            previous?.[29] ? { id: previous[29].id, createdAt: previous[29].createdAt } : null,
          ],
    ([, id, , , before]) =>
      getGroupPosts(String(id), before ? (before as { id: string; createdAt: string }) : undefined),
    { persistSize: false, revalidateOnFocus: false }
  )
  const posts = [
    ...new Map((pages ?? []).flatMap((page) => page.slice(0, 30)).map((post) => [post.id, post])).values(),
  ]
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("newest"),
    [mediaOnly, setMediaOnly] = useState(false)
  const [postText, setPostText] = useState(""),
    [postImages, setPostImages] = useState<string[]>([]),
    [reading, setReading] = useState(false)
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("")
  const [pending, setPending] = useState<string[]>([]),
    locks = useRef(new Set<string>())
  const imageLock = useRef(false)
  const [showMembers, setShowMembers] = useState(false),
    [memberQuery, setMemberQuery] = useState("")
  const {
    data: members,
    error: membersError,
    isLoading: membersLoading,
    mutate: refreshMembers,
  } = useSWR(showMembers && user ? ["community-group-members", groupId, user.id] : null, () =>
    getGroupMembers(groupId)
  )
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null),
    [commentText, setCommentText] = useState("")
  const {
    data: comments,
    error: commentsError,
    isLoading: commentsLoading,
    mutate: refreshComments,
  } = useSWR(commentsPostId && user ? ["community-group-comments", commentsPostId, user.id] : null, () =>
    getGroupPostComments(commentsPostId!)
  )
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "post" | "group"; id: string } | null>(null)
  const [showSettings, setShowSettings] = useState(false),
    [settingsName, setSettingsName] = useState(""),
    [settingsDescription, setSettingsDescription] = useState("")
  const [settingsSnapshot, setSettingsSnapshot] = useState<{
    name: string
    description: string | null
  } | null>(null)
  const [mediaPreview, setMediaPreview] = useState<string | null>(null)
  const run = async (key: string, action: () => Promise<Outcome>, after?: () => void) => {
    if (locks.current.has(key)) return
    locks.current.add(key)
    setPending([...locks.current])
    setError("")
    setNotice("")
    try {
      const result = await action()
      if (!result.success) {
        setError(result.error ?? "This action could not be saved.")
        return
      }
      after?.()
    } catch {
      setError("We could not confirm this action. Refresh before retrying; your text has been kept.")
    } finally {
      locks.current.delete(key)
      setPending([...locks.current])
    }
  }
  const refresh = () => {
    void refreshGroup()
    void refreshPosts()
  }
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (imageLock.current || !files.length) return
    if (
      files.length + postImages.length > 4 ||
      files.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type) ||
          file.size > 1024 * 1024
      )
    ) {
      setError("Choose up to four JPG, PNG, WebP or GIF photos, each no larger than 1 MB.")
      return
    }
    imageLock.current = true
    setReading(true)
    setError("")
    try {
      const images = await Promise.all(files.map(imageData))
      setPostImages((current) => [...current, ...images])
    } catch {
      setError("A photo could not be read. Please select it again.")
    } finally {
      imageLock.current = false
      setReading(false)
    }
  }
  const share = async () => {
    try {
      const url = `${location.origin}/customer/community/${encodeURIComponent(groupId)}`
      if (navigator.share) await navigator.share({ title: group?.name ?? "MySaji community", url })
      else {
        await navigator.clipboard.writeText(url)
        setNotice("Group link copied. Recipients may need to sign in.")
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError("Sharing is unavailable. Copy the address from your browser.")
    }
  }
  const visible = posts
    .filter(
      (post) =>
        (!mediaOnly || post.images.length > 0) &&
        `${post.content} ${post.authorName}`.toLowerCase().includes(query.trim().toLowerCase())
    )
    .sort((a, b) =>
      sort === "discussed"
        ? b.commentCount - a.commentCount
        : Date.parse(b.createdAt) - Date.parse(a.createdAt)
    )
  const owner = !!user && group?.createdById === user.id
  if (!authLoading && !user)
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Sign in to open this group</h1>
        <p className="text-sm text-muted-foreground">Return to MySaji to sign in and continue the conversation.</p>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm text-primary">Return to MySaji</Link>
      </div>
    )
  if (authLoading || isLoading || (!group && !groupError && group === undefined))
    return (
      <div role="status" className="flex items-center justify-center gap-3 p-16">
        <Loader2 className="animate-spin" />
        Loading group...
      </div>
    )
  if (groupError)
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">The group could not load</h1>
        <p className="text-sm text-muted-foreground">Please check your connection and retry.</p>
        <Button onClick={() => void refreshGroup()}>Try again</Button>
      </div>
    )
  if (!group)
    return (
      <div className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Group unavailable</h1>
        <Link href="/customer/community" className="text-primary underline">
          Back to community
        </Link>
      </div>
    )
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
      <Link
        href="/customer/community"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-primary"
      >
        <ArrowLeft size={16} />
        Back to community
      </Link>
      <header className="overflow-hidden rounded-3xl border bg-card">
        <div className="border-t-4 border-orange-500 p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 flex-1 basis-64 gap-4">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground">
                {group.image ? (
                  <Image src={group.image} alt="" fill className="object-cover" />
                ) : (
                  group.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  MySaji community group
                </p>
                <h1 className="break-words text-3xl font-semibold">{group.name}</h1>
                <button
                  type="button"
                  onClick={() => setShowMembers(true)}
                  className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground"
                >
                  <Users size={16} />
                  {group.memberCount} members <span className="text-primary">View people</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void share()}>
                <Share2 size={16} />
                Share group
              </Button>
              {owner&&!group.isJoined&&<Button disabled={pending.includes("membership")} onClick={()=>void run("membership",()=>toggleJoinGroup({groupId}),()=>{refresh();setNotice("Your creator membership is restored.")})}>Restore creator membership</Button>}
              {owner ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSettingsName(group.name)
                    setSettingsDescription(group.description ?? "")
                    setSettingsSnapshot({ name: group.name, description: group.description })
                    setShowSettings(true)
                  }}
                >
                  <Settings2 size={16} />
                  Group settings
                </Button>
              ) : (
                <Button
                  disabled={pending.includes("membership")}
                  variant={group.isJoined ? "outline" : "default"}
                  onClick={() =>
                    void run(
                      "membership",
                      () => toggleJoinGroup({ groupId }),
                      () => {
                        refresh()
                        setNotice(
                          group.isJoined
                            ? "You left the group."
                            : "You joined the group. You can now contribute."
                        )
                      }
                    )
                  }
                >
                  {group.isJoined ? "Leave group" : "Join group"}
                </Button>
              )}
            </div>
          </div>
          <p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-7 text-muted-foreground">
            {group.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-6 border-t bg-muted/30 px-5 py-4 text-xs sm:px-8">
          <span>{group.isJoined ? "You are a member" : "Read discussions or join to take part"}</span>
          <span>{posts.length} discussions loaded</span>
          <span>Public group - keep personal details private</span>
        </div>
      </header>
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-xl bg-primary/5 p-4 text-sm">
          {notice}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 space-y-5" aria-label="Group discussions">
          {group.isJoined ? (
            <Card data-customer-panel className="gap-4 p-5">
              <h2 className="text-lg font-semibold">Start a conversation</h2>
              <div className="flex flex-wrap gap-2">
                {["#Question", "#Recommendation", "#LocalTip"].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={pending.includes("post")}
                    onClick={() => setPostText((current) => current || `${tag}\n`)}
                    className="min-h-10 rounded-full border px-3 text-xs font-medium"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <Textarea
                aria-label="Group post text"
                placeholder="Ask a question, share an experience or help someone out..."
                value={postText}
                onChange={(event) => setPostText(event.target.value)}
                maxLength={2000}
                disabled={pending.includes("post")}
                className="min-h-32 text-base"
              />
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{postText.length}/2,000 characters</span>
                <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3">
                  <ImagePlus size={16} />
                  Add photos
                  <input
                    aria-label="Attach group photos"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    className="sr-only"
                    onChange={(event) => void upload(event)}
                    disabled={reading || pending.includes("post") || postImages.length >= 4}
                  />
                </label>
              </div>
              {postImages.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {postImages.map((src, index) => (
                    <div key={index} className="relative aspect-square overflow-hidden rounded-xl">
                      <Image src={src} alt={`Attachment ${index + 1}`} fill className="object-cover" />
                      <button
                        type="button"
                        aria-label={`Remove photo ${index + 1}`}
                        disabled={pending.includes("post")}
                        onClick={() => setPostImages((current) => current.filter((_, i) => i !== index))}
                        className="absolute right-1 top-1 rounded-full bg-black/70 p-2 text-white"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                Up to 4 photos, 1 MB each. Your post is visible to people viewing this group.
              </p>
              <Button
                disabled={reading || pending.includes("post") || (!postText.trim() && !postImages.length)}
                onClick={() =>
                  void run(
                    "post",
                    () => createGroupPost({ groupId, content: postText, images: postImages }),
                    () => {
                      setPostText("")
                      setPostImages([])
                      setNotice("Your group post is published.")
                      void refreshPosts()
                    }
                  )
                }
              >
                {reading
                  ? "Preparing photos..."
                  : pending.includes("post")
                    ? "Publishing..."
                    : "Publish to group"}
              </Button>
            </Card>
          ) : (
            <Card className="p-5">
              <h2 className="text-lg font-semibold">A conversation worth joining</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Browse the discussions below. Join the group to write posts, comment and react.
              </p>
            </Card>
          )}
          <Card data-customer-panel className="gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Discussions</h2>
              <Button variant="outline" disabled={refreshing} onClick={() => void refreshPosts()}>
                {refreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="relative">
                <Search size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
                <Input
                  aria-label="Search group discussions"
                  placeholder="Search this loaded discussion history"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-9"
                />
              </label>
              <select
                aria-label="Sort group discussions"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="min-h-11 rounded-lg border bg-background px-3 text-sm"
              >
                <option value="newest">Newest first</option>
                <option value="discussed">Most discussed (loaded)</option>
              </select>
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mediaOnly}
                onChange={(event) => setMediaOnly(event.target.checked)}
              />
              Posts with photos
            </label>
            <p className="text-xs text-muted-foreground">
              {visible.length} matching posts in loaded history. Load older discussions to search further.
            </p>
          </Card>
          {postsError && (
            <div role="alert" className="rounded-xl border p-4 text-sm">
              Discussions could not refresh.{" "}
              <button onClick={() => void refreshPosts()} className="min-h-11 px-3 text-primary underline">
                Retry
              </button>
            </div>
          )}
          {!visible.length && !refreshing && (
            <Card className="p-8 text-center">
              <MessageCircle size={28} className="mx-auto text-primary" />
              <h3 className="text-lg font-semibold">
                {posts.length ? "No matching discussions" : "Make the first connection"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {posts.length
                  ? "Try another search or load older posts."
                  : "Share a useful question or welcome your neighbours."}
              </p>
            </Card>
          )}
          {visible.map((post) => (
            <Card key={post.id} data-customer-panel className="gap-0 overflow-hidden p-0">
              <div className="flex items-start justify-between gap-3 p-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
                    {post.authorAvatar ? (
                      <Image src={post.authorAvatar} alt="" fill className="object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center text-sm font-semibold">
                        {post.authorName.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold">{post.authorName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatRelativeTime(post.createdAt)}</p>
                  </div>
                </div>
                {post.isMine && (
                  <button
                    aria-label={`Delete post by ${post.authorName}`}
                    onClick={() => setDeleteTarget({ kind: "post", id: post.id })}
                    className="rounded-lg p-3 text-muted-foreground hover:text-red-600"
                  >
                    <Trash2 size={17} />
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words px-5 pb-5 text-sm leading-7 sm:text-base">
                {post.content}
              </p>
              {post.images.length > 0 && (
                <div className={`grid gap-1 ${post.images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {post.images.map((src, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-label={`View photo ${index + 1}`}
                      onClick={() => setMediaPreview(src)}
                      className={`relative overflow-hidden ${post.images.length === 1 ? "aspect-video" : "aspect-square"}`}
                    >
                      <Image src={src} alt={`Group post photo ${index + 1}`} fill className="object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t p-3">
                <button
                  disabled={!group.isJoined || pending.includes(`like:${post.id}`)}
                  aria-pressed={post.isLiked}
                  aria-label={`Like post by ${post.authorName}`}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm disabled:opacity-50"
                  onClick={() =>
                    void run(`like:${post.id}`, async () => {
                      const result = await toggleGroupPostLike({ groupPostId: post.id })
                      if (result.success)
                        await refreshPosts(
                          (current) =>
                            current?.map((page) =>
                              page.map((item) =>
                                item.id === post.id
                                  ? { ...item, isLiked: result.isActive, likeCount: result.count }
                                  : item
                              )
                            ),
                          { revalidate: false }
                        )
                      return result
                    })
                  }
                >
                  <Heart size={18} className={post.isLiked ? "fill-red-500 text-red-500" : ""} />
                  {post.likeCount}
                </button>
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm"
                  onClick={() => {
                    setCommentsPostId(post.id)
                    setCommentText("")
                  }}
                >
                  <MessageCircle size={18} />
                  {post.commentCount} replies
                </button>
              </div>
            </Card>
          ))}
          {pages?.at(-1)?.length === 31 && (
            <Button
              variant="outline"
              className="min-h-11 w-full"
              disabled={refreshing}
              onClick={() => void setSize(size + 1)}
            >
              {refreshing ? "Loading..." : "Load older discussions"}
            </Button>
          )}
        </section>
        <aside aria-label="About this community group" className="space-y-4">
          <Card data-customer-panel className="gap-3 border-t-4 border-t-primary p-5">
            <h2 className="text-base font-semibold">Make this space useful</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Ask clear questions, share honest experiences and disagree respectfully. Avoid posting private
              contact, payment or identity details.
            </p>
            <Link href="/terms" className="min-h-11 py-2 text-sm font-medium text-primary underline">
              Community responsibilities
            </Link>
            <Link href="/customer/help" className="min-h-11 py-2 text-sm font-medium text-primary underline">
              Get help or raise a concern
            </Link>
          </Card>
          <Card data-customer-panel className="gap-3 p-5">
            <Users size={24} className="text-primary" />
            <h2 className="text-base font-semibold">People make the group</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Find members and see who helps manage this space.
            </p>
            <Button variant="outline" onClick={() => setShowMembers(true)}>
              Explore members
            </Button>
            <Link href="/customer/community" className="min-h-11 py-2 text-sm text-primary">
              Discover other groups
            </Link>
          </Card>
        </aside>
      </div>
      <Dialog open={showMembers} onOpenChange={setShowMembers}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Group members</DialogTitle>
            <DialogDescription>
              Names and group roles; private contact details are not shown.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="Search group members"
            placeholder="Find a member by name"
            value={memberQuery}
            onChange={(event) => setMemberQuery(event.target.value)}
          />
          {membersLoading && <p role="status">Loading members...</p>}
          {membersError && (
            <p role="alert">
              Members could not load.{" "}
              <button onClick={() => void refreshMembers()} className="text-primary underline">
                Retry
              </button>
            </p>
          )}
          <div className="space-y-3">
            {(members ?? [])
              .filter((member) => member.name.toLowerCase().includes(memberQuery.toLowerCase()))
              .map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <span className="break-words text-sm font-medium">{member.name}</span>
                  {member.isAdmin && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-primary">
                      <Shield size={14} />
                      Group admin
                    </span>
                  )}
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!commentsPostId}
        onOpenChange={(open) => {
          if (!open && !pending.includes("comment")) setCommentsPostId(null)
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Discussion replies</DialogTitle>
            <DialogDescription>
              {group.isJoined
                ? "Contribute a helpful, respectful reply."
                : "Join the group to add your reply."}
            </DialogDescription>
          </DialogHeader>
          {commentsLoading && <p role="status">Loading replies...</p>}
          {commentsError && (
            <p role="alert">
              Replies could not load.{" "}
              <button className="text-primary underline" onClick={() => void refreshComments()}>
                Retry
              </button>
            </p>
          )}
          <div className="max-h-[40dvh] space-y-3 overflow-y-auto">
            {(comments ?? []).map((comment) => (
              <div key={comment.id} className="rounded-xl bg-muted p-4">
                <p className="text-sm font-semibold">{comment.authorName}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{comment.content}</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatRelativeTime(comment.createdAt)}</p>
              </div>
            ))}
          </div>
          {group.isJoined && (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                if (!commentsPostId) return
                void run(
                  "comment",
                  () => addGroupPostComment({ groupPostId: commentsPostId, content: commentText }),
                  () => {
                    setCommentText("")
                    void refreshComments()
                    void refreshPosts()
                  }
                )
              }}
              className="space-y-3 border-t pt-4"
            >
              <Textarea
                aria-label="Group reply"
                value={commentText}
                maxLength={2000}
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Write a helpful reply..."
              />
              <Button disabled={!commentText.trim() || pending.includes("comment")}>
                <Send size={16} />
                Send reply
              </Button>
            </form>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Group settings</DialogTitle>
            <DialogDescription>Only the creator can change the name and description.</DialogDescription>
          </DialogHeader>
          <label className="space-y-2 text-sm">
            Group name
            <Input
              aria-label="Group name"
              maxLength={100}
              value={settingsName}
              onChange={(event) => setSettingsName(event.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm">
            Description
            <Textarea
              aria-label="Group description"
              maxLength={1000}
              value={settingsDescription}
              onChange={(event) => setSettingsDescription(event.target.value)}
            />
          </label>
          <Button
            disabled={pending.includes("settings") || !settingsName.trim() || !settingsDescription.trim()}
            onClick={() =>
              void run(
                "settings",
                () =>
                  updateMyCommunityGroup({
                    groupId,
                    name: settingsName,
                    description: settingsDescription,
                    expectedName: settingsSnapshot?.name,
                    expectedDescription: settingsSnapshot?.description,
                  }),
                () => {
                  setShowSettings(false)
                  setNotice("Group details updated.")
                  void refreshGroup()
                }
              )
            }
          >
            Save group details
          </Button>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-red-200 px-4 text-sm text-red-700"
            onClick={() => {
              setShowSettings(false)
              setDeleteTarget({ kind: "group", id: groupId })
            }}
          >
            Delete this group
          </button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !pending.includes("delete")) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.kind === "group" ? "this group" : "your post"}?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.kind === "group"
                ? "The group, memberships and discussions will be permanently removed."
                : "This post and its replies will be permanently removed."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={pending.includes("delete")}
              onClick={() =>
                void run(
                  "delete",
                  () =>
                    deleteTarget?.kind === "group"
                      ? deleteGroup({ groupId })
                      : deleteGroupPost({ groupPostId: deleteTarget!.id }),
                  () => {
                    if (deleteTarget?.kind === "group") window.location.assign("/customer/community")
                    else {
                      setDeleteTarget(null)
                      setNotice("Post deleted.")
                      void refreshPosts()
                    }
                  }
                )
              }
            >
              Delete permanently
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!mediaPreview}
        onOpenChange={(open) => {
          if (!open) setMediaPreview(null)
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Group photo</DialogTitle>
          </DialogHeader>
          {mediaPreview && (
            <div className="relative h-[65dvh] w-full">
              <Image src={mediaPreview} alt="Group post photo" fill className="object-contain" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
