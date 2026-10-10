"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { X, Heart, Send, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import {
  toggleStoryLike, replyToStory, markStoryViewed, type StoryFeedGroup, type StoryFeedItem,
} from "@/backend/actions/provider-stories"

export function ProviderStoryRing({ groups }: { groups: StoryFeedGroup[] }) {
  const [openGroupIndex, setOpenGroupIndex] = useState<number | null>(null)
  const [localGroups, setLocalGroups] = useState(groups)

  // `groups` starts empty while the parent's SWR fetch is still in flight —
  // useState only reads its initializer once, so without this the ring stays
  // permanently empty even after real data arrives on a later render.
  useEffect(() => {
    setLocalGroups(groups)
  }, [groups])

  if (localGroups.length === 0) return null

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
        {localGroups.map((group, i) => (
          <button
            key={group.providerId}
            onClick={() => setOpenGroupIndex(i)}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16"
          >
            {/* Green while anything here is unwatched, grey once it has all
                been seen — the standard status-ring signal, so a customer can
                tell at a glance which rings are worth opening. */}
            <div className={`h-16 w-16 rounded-full p-[2.5px] ${group.hasUnviewed ? "bg-emerald-500" : "bg-muted-foreground/30"}`}>
              <div className="w-full h-full rounded-full p-[2px] bg-background">
                <img
                  src={group.providerAvatar || "/placeholder.svg"}
                  alt={group.providerName}
                  className="w-full h-full rounded-full object-cover"
                />
              </div>
            </div>
            <span className={`w-full truncate text-center text-[10px] ${group.hasUnviewed ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {group.providerName.split(" ")[0]}
            </span>
          </button>
        ))}
      </div>

      {openGroupIndex !== null && (
        <StoryViewer
          groups={localGroups}
          groupIndex={openGroupIndex}
          // Re-sorted on close rather than mid-watch: moving a ring while the
          // viewer sits on top of it would shuffle the row underneath and
          // change which group "next" leads to. Watched groups drop to the
          // end here, and the server applies the same order on the next fetch.
          onClose={() => {
            setOpenGroupIndex(null)
            setLocalGroups((prev) => [...prev].sort((a, b) => (a.hasUnviewed === b.hasUnviewed ? 0 : a.hasUnviewed ? -1 : 1)))
          }}
          onGroupIndexChange={setOpenGroupIndex}
          onStoryUpdate={(providerId, storyId, patch) => {
            setLocalGroups((prev) => prev.map((g) => {
              if (g.providerId !== providerId) return g
              const stories = g.stories.map((s) => (s.id === storyId ? { ...s, ...patch } : s))
              // Derived, never patched directly: the ring greys out exactly
              // when the last unwatched story in the group is seen.
              return { ...g, stories, hasUnviewed: stories.some((s) => !s.viewedByMe) }
            }))
          }}
        />
      )}
    </>
  )
}

function StoryViewer({
  groups, groupIndex, onClose, onGroupIndexChange, onStoryUpdate,
}: {
  groups: StoryFeedGroup[]
  groupIndex: number
  onClose: () => void
  onGroupIndexChange: (i: number) => void
  onStoryUpdate: (providerId: string, storyId: string, patch: Partial<StoryFeedItem>) => void
}) {
  const router = useRouter()
  const [storyIndex, setStoryIndex] = useState(0)
  const [replyText, setReplyText] = useState("")
  const [isReplying, setIsReplying] = useState(false)
  const [replyError, setReplyError] = useState("")
  const [replySent, setReplySent] = useState(false)

  const group = groups[groupIndex]
  const story = group?.stories[storyIndex]

  // Marked as each story is actually put on screen, not when the group is
  // opened — paging away after the first of three should leave the other two
  // unwatched, and the ring green.
  useEffect(() => {
    if (!group || !story || story.viewedByMe) return
    onStoryUpdate(group.providerId, story.id, { viewedByMe: true })
    void markStoryViewed({ storyId: story.id })
  }, [group, story, onStoryUpdate])

  if (!group || !story) return null

  const goToStory = (nextGroupIndex: number, nextStoryIndex: number) => {
    setReplyText("")
    setReplyError("")
    setReplySent(false)
    if (nextGroupIndex < 0 || nextGroupIndex >= groups.length) { onClose(); return }
    onGroupIndexChange(nextGroupIndex)
    setStoryIndex(nextStoryIndex)
  }

  const handlePrev = () => {
    if (storyIndex > 0) setStoryIndex(storyIndex - 1)
    else goToStory(groupIndex - 1, 0)
  }
  const handleNext = () => {
    if (storyIndex < group.stories.length - 1) setStoryIndex(storyIndex + 1)
    else goToStory(groupIndex + 1, 0)
  }

  const handleLike = async () => {
    const optimisticLiked = !story.likedByMe
    onStoryUpdate(group.providerId, story.id, {
      likedByMe: optimisticLiked,
      likeCount: story.likeCount + (optimisticLiked ? 1 : -1),
    })
    const result = await toggleStoryLike({ storyId: story.id })
    if (result.success) {
      onStoryUpdate(group.providerId, story.id, { likedByMe: result.likedByMe, likeCount: result.likeCount })
    }
  }

  const handleReply = async () => {
    if (!replyText.trim()) return
    setIsReplying(true)
    setReplyError("")
    const result = await replyToStory({ storyId: story.id, message: replyText.trim() })
    setIsReplying(false)
    if (!result.success) { setReplyError(result.error); return }
    setReplySent(true)
    setReplyText("")
    setTimeout(() => router.push(`/customer/messages?conversation=${result.conversationId}`), 900)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Progress bars */}
      <div className="flex gap-1 px-3 pt-3">
        {group.stories.map((s, i) => (
          <div key={s.id} className="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden">
            <div className={`h-full bg-white ${i < storyIndex ? "w-full" : i === storyIndex ? "w-full" : "w-0"}`} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <img src={group.providerAvatar || "/placeholder.svg"} alt={group.providerName} className="w-9 h-9 rounded-full object-cover" />
          <div>
            <p className="text-white text-xs font-semibold">{group.providerName}</p>
            <p className="text-white/60 text-[11px]">Work in Action</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 text-white/80 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Content */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center px-3">
        <button onClick={handlePrev} aria-label="Previous story" className="absolute left-1 top-1/2 -translate-y-1/2 z-10 p-2 text-white/60 hover:text-white">
          <ChevronLeft className="w-7 h-7" />
        </button>
        <button onClick={handleNext} aria-label="Next story" className="absolute right-1 top-1/2 -translate-y-1/2 z-10 p-2 text-white/60 hover:text-white">
          <ChevronRight className="w-7 h-7" />
        </button>

        <div className="w-full max-w-md grid grid-cols-2 gap-1.5">
          <div className="space-y-1">
            <p className="text-white/70 text-[10px] font-medium text-center">Before</p>
            <img src={story.beforeImage} alt="Before" className="w-full aspect-[3/4] object-cover rounded-lg" />
          </div>
          <div className="space-y-1">
            <p className="text-white/70 text-[10px] font-medium text-center">After</p>
            <img src={story.afterImage} alt="After" className="w-full aspect-[3/4] object-cover rounded-lg" />
          </div>
        </div>
      </div>

      {story.caption && (
        <p className="text-white text-xs text-center px-6 py-2">{story.caption}</p>
      )}

      {/* Footer: like + reply */}
      <div className="p-3 pb-4 flex items-center gap-3">
        <button onClick={handleLike} className="flex items-center gap-1.5 text-white flex-shrink-0">
          <Heart className={`w-6 h-6 ${story.likedByMe ? "fill-red-500 text-red-500" : "text-white"}`} />
          {story.likeCount > 0 && <span className="text-xs">{story.likeCount}</span>}
        </button>

        {replySent ? (
          <p className="flex-1 text-xs text-emerald-400">Sent! Opening your conversation...</p>
        ) : (
          <>
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleReply() }}
              placeholder={`Reply to ${group.providerName.split(" ")[0]}...`}
              className="flex-1 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-white/50 px-4 py-2 text-xs focus:outline-none focus:border-white/40"
            />
            <button onClick={handleReply} disabled={!replyText.trim() || isReplying} aria-label="Send reply" className="p-2 text-white flex-shrink-0 disabled:opacity-40">
              {isReplying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </>
        )}
      </div>
      {replyError && <p className="text-red-400 text-[11px] text-center pb-2">{replyError}</p>}
    </div>
  )
}
