"use client"

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import {
  Search, SlidersHorizontal, Plus, ArrowLeft, MoreVertical, Send, Paperclip, Smile, Mic,
  Check, CheckCheck, Loader2, MapPin, ImageIcon, File as FileIcon, Lock, ShieldCheck,
  Trash2, Reply, Copy, X, Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { NewConversationModal } from "@/components/messages/new-conversation-modal"
import { CallButton } from "@/components/messages/call-button"
import { VoiceMessagePlayer } from "@/components/messages/voice-message-player"
import { StaticLocationMap } from "@/components/maps/static-location-map"
import {
  getConversations, sendMessage, getOrCreateConversation, clearConversation,
  deleteConversation, deleteMessage, blockChatUser, unblockChatUser, reportChatUser, getBlockState,
  type ConversationSummary,
} from "@/lib/actions/messages"
import { useLongPress, useSwipeToReply } from "@/lib/hooks/useMessageGestures"
import { getCallHistory, type CallHistoryItem } from "@/lib/actions/calls"
import { useConversationMessages, type ChatMessage } from "@/lib/hooks/useConversationMessages"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

type Filter = "all" | "unread" | "jobs" | "calls"

/** The one "classic" two-panel chat shell every portal's messages page
 * renders (see each portal's app/<portal>/messages/page.tsx — now a thin
 * wrapper around this). Replaces 8 independently hand-built implementations (~2,700 lines
 * of near-duplicated markup, each with its own bespoke 4-theme system) with
 * a single component so every portal genuinely looks and behaves the same
 * way, instead of "similar but subtly different everywhere."
 *
 * Deliberately deviates from the reference mockup in a few places where the
 * mockup implied something this app doesn't actually have:
 *  - No top-level "Calls" button — there's no call *history* feature (real
 *    per-conversation calling exists via CallButton, in the active chat's
 *    own header, same as before).
 *  - No "Groups" filter — this app's Conversation model is strictly 1:1;
 *    there's no group-chat feature to filter into.
 *  - The mockup's "Messages are end-to-end encrypted" banner is not true
 *    here (messages are plain rows in Postgres) — swapped for an honest
 *    "only you and this person can see these messages" notice instead.
 *  - No "Payment" quick action — there's no real send-a-payment-in-chat
 *    feature to wire it to.
 * Everything else (online status, Jobs filter, date dividers, bubble
 * styling, emoji/voice/attach) is real, backed by existing data/actions.
 */
export function ClassicChat({ showRoleFilter = false }: { showRoleFilter?: boolean }) {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <ClassicChatContent showRoleFilter={showRoleFilter} />
    </Suspense>
  )
}

function ClassicChatContent({ showRoleFilter }: { showRoleFilter: boolean }) {
  const { t } = useLocalization()
  const searchParams = useSearchParams()

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [showNewChat, setShowNewChat] = useState(false)
  const [callAutoStart, setCallAutoStart] = useState<number | undefined>(undefined)

  const [messageInput, setMessageInput] = useState("")
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  // The message being replied to, and the one held to act on. Only ever one
  // of each: this is a quote-and-act UI, not multi-select.
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null)
  const [isBlocked, setIsBlocked] = useState(false)
  const [calls, setCalls] = useState<CallHistoryItem[]>([])
  const [showReport, setShowReport] = useState(false)
  const [reportReason, setReportReason] = useState("")
  const [reportNotice, setReportNotice] = useState("")
  // The media a bubble opens full-screen — a photo or a map, WhatsApp-style.
  const [openMedia, setOpenMedia] = useState<ChatMessage | null>(null)

  /**
   * Both overlays below are opened by a press-and-hold, and lifting the finger
   * makes the browser synthesise a click at that same point — which lands on
   * the backdrop that just appeared and dismisses it again, so the sheet
   * flashed open and shut for any message not near the bottom of the screen.
   *
   * Dismissing on pointerdown rather than click fixes it without a timer: the
   * press that opened the overlay went down on the bubble, before the backdrop
   * existed, so only a genuinely new press can close it.
   */
  const openOverlay = <T,>(set: (v: T) => void, value: T) => set(value)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimeRef = useRef(0)
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { messages, mutateMessages, isLoadingMessages } = useConversationMessages(activeChat)

  /**
   * Size the shell to the space actually left on screen, so the page itself
   * never scrolls and only the panels inside it do.
   *
   * Measured rather than hardcoded: this one component is rendered by eight
   * portals whose chrome differs (customer, Saji Pro, distributor, admin,
   * agent, secretary, sub-admin), and each mobile nav bar is a different
   * height. A fixed `100dvh - 8rem` was right for none of them and left the
   * composer under the nav on some.
   */
  const shellRef = useRef<HTMLDivElement>(null)
  const [shellHeight, setShellHeight] = useState<number | null>(null)

  useEffect(() => {
    const measure = () => {
      const el = shellRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      let bottomChrome = 0
      document.querySelectorAll("nav").forEach((node) => {
        const nav = node as HTMLElement
        const style = window.getComputedStyle(nav)
        // Only bars pinned to the very bottom of the viewport steal height.
        if (style.position === "fixed" && Math.abs(parseFloat(style.bottom || "0")) < 1 && nav.offsetHeight > 0) {
          bottomChrome = Math.max(bottomChrome, nav.offsetHeight)
        }
      })
      setShellHeight(Math.max(360, window.innerHeight - top - bottomChrome))
    }

    measure()
    // The portals' mobile nav bars mount after this component does, so a
    // single measurement on mount finds no bottom chrome and sizes the shell
    // straight over the nav — which put the composer underneath it. Watching
    // the document catches the nav appearing, the keyboard opening, and a
    // rotation, without polling.
    const observer = new ResizeObserver(measure)
    observer.observe(document.documentElement)
    if (document.body) observer.observe(document.body)

    window.addEventListener("resize", measure)
    // The mobile keyboard resizes the visual viewport without firing resize.
    window.visualViewport?.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
      window.visualViewport?.removeEventListener("resize", measure)
    }
    // Re-runs once loading finishes: the first pass happens while this
    // component is still rendering its spinner, so shellRef.current is null
    // and there is nothing to measure. Without this dependency the shell kept
    // its natural content height and the last messages sat under the nav bar.
  }, [isLoading])

  const emojiMap: Record<string, string> = { thumbsup: "👍", heart: "❤️", fire: "🔥", star: "⭐", wave: "👋", clap: "👏", check: "✅", "100": "💯", sparkle: "✨", pray: "🙏", muscle: "💪", smile: "😊" }

  const refreshConversations = useCallback(() => getConversations().then(setConversations), [])

  useEffect(() => {
    refreshConversations().finally(() => setIsLoading(false))
  }, [refreshConversations])

  // Only fetched when the tab is actually opened — most sessions never look
  // at call history, and this page already makes several calls on load.
  useEffect(() => {
    if (filter !== "calls") return
    getCallHistory().then(setCalls).catch(() => {})
  }, [filter])

  useEffect(() => {
    const conversationParam = searchParams.get("conversation")
    if (conversationParam) setActiveChat(conversationParam)
  }, [searchParams])

  // Deep-link support — "?client=<id>" / "?provider=<id>" links elsewhere in
  // the app (home page cards, profile pages) open straight into a
  // conversation with that person instead of the bare inbox.
  useEffect(() => {
    const otherParam = searchParams.get("client") ?? searchParams.get("provider")
    const actionParam = searchParams.get("action")
    if (!otherParam) return
    getOrCreateConversation({ otherUserId: otherParam }).then(async (result) => {
      if (!result.success) return
      await refreshConversations()
      setActiveChat(result.conversationId)
      if (actionParam === "call") setCallAutoStart(Date.now())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  // Whether this person is blocked is per-conversation, so it is re-read
  // whenever the open chat changes rather than being assumed from the last.
  useEffect(() => {
    if (!activeChat) { setIsBlocked(false); return }
    let cancelled = false
    getBlockState(activeChat).then((state) => { if (!cancelled) setIsBlocked(state.blocked) }).catch(() => {})
    return () => { cancelled = true }
  }, [activeChat])

  const selectedChat = conversations.find((c) => c.id === activeChat)

  const filteredConversations = conversations
    .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((c) => (filter === "unread" ? c.unreadCount > 0 : filter === "jobs" ? c.jobId !== null : true))

  const resetFilters = () => { setSearchQuery(""); setFilter("all") }

  const doSend = async (type: ChatMessage["type"], content?: string, attachmentUrl?: string) => {
    if (!activeChat) return
    // Captured before the await so a quote can't attach to a later message if
    // the user starts another one while this is in flight.
    const quotedId = replyTo?.id
    setReplyTo(null)
    setShowAttachMenu(false)
    const result = await sendMessage({ conversationId: activeChat, type: type as any, content, attachmentUrl, replyToId: quotedId })
    if (result.success) {
      mutateMessages((prev) => [...(prev ?? []), result.message], { revalidate: false })
      refreshConversations()
    }
  }

  const handleDeleteConversation = async () => {
    if (!pendingDelete) return
    const id = pendingDelete.id
    setPendingDelete(null)
    if (activeChat === id) setActiveChat(null)
    // Dropped from the list first. Waiting on the round trip left the row
    // sitting there for seconds after the confirm, which reads as "nothing
    // happened"; a failure puts it straight back.
    setConversations((prev) => prev.filter((c) => c.id !== id))
    const result = await deleteConversation({ conversationId: id })
    if (!result.success) {
      await refreshConversations()
      return
    }
    await refreshConversations()
  }

  const handleDeleteMessage = async () => {
    const target = selectedMessage
    setSelectedMessage(null)
    if (!target) return
    const result = await deleteMessage({ messageId: target.id })
    if (!result.success) return
    mutateMessages((prev) => (prev ?? []).filter((m) => m.id !== target.id), { revalidate: false })
    refreshConversations()
  }

  const handleCopyMessage = async () => {
    const text = selectedMessage?.content
    setSelectedMessage(null)
    if (!text) return
    // Clipboard access is refused outside a secure context and in some
    // in-app browsers; a failed copy should be quiet, not a crash.
    await navigator.clipboard?.writeText(text).catch(() => {})
  }

  const handleSendText = async () => {
    const trimmed = messageInput.trim()
    if (!trimmed || !activeChat) return
    setMessageInput("")
    setShowEmojiPicker(false)
    await doSend("TEXT", trimmed)
  }

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => doSend("IMAGE", file.name, reader.result as string)
      reader.readAsDataURL(file)
    }
    e.target.value = ""
  }

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => doSend("FILE", `${file.name} (${(file.size / 1024).toFixed(1)} KB)`, reader.result as string)
      reader.readAsDataURL(file)
    }
    e.target.value = ""
  }

  const handleShareLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (position) => doSend("LOCATION", `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`),
      () => alert(t("chat.enableLocation")),
    )
  }

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      recordingTimeRef.current = 0
      setRecordingTime(0)
      recordingIntervalRef.current = setInterval(() => { recordingTimeRef.current += 1; setRecordingTime(recordingTimeRef.current) }, 1000)
      mediaRecorder.ondataavailable = (event) => audioChunksRef.current.push(event.data)
      mediaRecorder.onstop = () => {
        const minutes = Math.floor(recordingTimeRef.current / 60)
        const seconds = recordingTimeRef.current % 60
        const label = t("chat.voiceMessageLabel", { time: `${minutes}:${seconds.toString().padStart(2, "0")}` })
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        const reader = new FileReader()
        reader.onloadend = () => doSend("VOICE", label, reader.result as string)
        reader.readAsDataURL(blob)
        stream.getTracks().forEach((track) => track.stop())
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current)
      }
      mediaRecorder.start()
      setIsRecording(true)
    } catch {
      alert(t("chat.allowMicrophone"))
    }
  }
  const handleStopRecording = () => { mediaRecorderRef.current?.stop(); setIsRecording(false) }

  const handleMenuAction = async (action: "mute" | "block" | "report" | "clear") => {
    if (!activeChat) return
    if (action === "clear") {
      await clearConversation({ conversationId: activeChat })
      mutateMessages([], { revalidate: false })
      return
    }
    if (action === "report") { setReportReason(""); setShowReport(true); return }
    if (action === "block") {
      // Optimistic, because the composer swaps for the blocked notice on the
      // strength of this flag and a several-second wait reads as a dead tap.
      const next = !isBlocked
      setIsBlocked(next)
      const result = next
        ? await blockChatUser({ conversationId: activeChat })
        : await unblockChatUser({ conversationId: activeChat })
      if (!result.success) setIsBlocked(!next)
      return
    }
    alert(t("chat.notificationsMuted"))
  }

  const handleSubmitReport = async () => {
    if (!activeChat || !reportReason.trim()) return
    setShowReport(false)
    const result = await reportChatUser({ conversationId: activeChat, reason: reportReason.trim() })
    setReportReason("")
    setReportNotice(
      result.success
        ? (result.underReview ? t("chat.reportEscalated") : t("chat.reportSubmitted"))
        : t("chat.reportFailed"),
    )
  }

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    // The negative bottom margin cancels the pb-36/lg:pb-24 every portal's
    // <main> reserves for its floating chat button. On a page sized to the
    // viewport that reservation is just dead space under the composer, and it
    // was what made the whole page scroll.
    <div
      ref={shellRef}
      style={shellHeight ? { height: shellHeight } : undefined}
      className="-mb-36 flex w-full flex-col overflow-hidden bg-[#F4F5FB] dark:bg-slate-950 lg:-mb-24"
    >
      {/* Page header — spans both panels. Hidden on a phone once a
          conversation is open: there the thread replaces the inbox rather
          than sitting beside it, so a 200px title band above the messages is
          pure loss on the one screen with the least room. On lg the two
          panels are side by side and the header belongs to both. */}
      <div className={`flex-shrink-0 border-b border-border/60 bg-[#EEF0FA] px-4 py-4 dark:bg-slate-900 sm:px-6 ${activeChat ? "hidden lg:block" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{t("chat.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("chat.subtitle")}</p>
          </div>
          <Button onClick={() => setShowNewChat(true)} className="gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-white shadow-md hover:from-blue-700 hover:to-indigo-700">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">{t("chat.newChat")}</span>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {showNewChat ? (
          <NewConversationModal
            open
            onClose={() => setShowNewChat(false)}
            showRoleFilter={showRoleFilter}
            onConversationCreated={async (conversationId) => {
              setShowNewChat(false)
              await refreshConversations()
              setActiveChat(conversationId)
            }}
          />
        ) : (
        <>
        {/* Conversation list */}
        <div className={`flex w-full flex-col border-r border-border/60 bg-card lg:w-[360px] ${activeChat ? "hidden lg:flex" : "flex"}`}>
          <div className="flex-shrink-0 space-y-3 border-b border-border/60 p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t("chat.searchPlaceholder")} className="h-10 rounded-full border-0 bg-muted pl-9" />
              </div>
              <button onClick={resetFilters} title={t("common.filter")} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80">
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {([["all", t("chat.filterAll")], ["unread", t("chat.filterUnread")], ["jobs", t("chat.filterJobs")], ["calls", t("chat.filterCalls")]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setFilter(id)}
                  className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    filter === id ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filter === "calls" ? (
              calls.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">{t("chat.noCalls")}</div>
              ) : (
                calls.map((call) => (
                  <CallHistoryRow
                    key={call.id}
                    call={call}
                    t={t}
                    // Opening the conversation is what makes calling back
                    // possible: the dialler lives in its header, and a call
                    // can only ring while its conversation is the open one.
                    onCallBack={() => { setActiveChat(call.conversationId); setFilter("all") }}
                  />
                ))
              )
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {conversations.length === 0 ? (
                  <>
                    <p className="font-medium text-foreground">{t("chat.noConversations")}</p>
                    <p className="mt-1">{t("chat.noConversationsHint")}</p>
                  </>
                ) : t("chat.noMatchingConversations")}
              </div>
            ) : (
              filteredConversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  isActive={activeChat === c.id}
                  onOpen={() => setActiveChat(c.id)}
                  onRequestDelete={() => openOverlay(setPendingDelete, c)}
                />
              ))
            )}
          </div>
        </div>

        {/* Active conversation */}
        <div className={`flex min-h-0 flex-1 flex-col bg-background ${activeChat ? "flex" : "hidden lg:flex"}`}>
          {activeChat && selectedChat ? (
            <>
              <div className="flex flex-shrink-0 items-center justify-between border-b border-border/60 bg-card px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button onClick={() => setActiveChat(null)} aria-label={t("common.back")} className="rounded-lg p-1.5 hover:bg-muted lg:hidden"><ArrowLeft className="h-5 w-5" /></button>
                  <Image src={selectedChat.avatar || "/placeholder.svg"} alt={selectedChat.name} width={40} height={40} className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-foreground">{selectedChat.name}</h2>
                    {selectedChat.isOnline !== null ? (
                      <p className={`text-xs ${selectedChat.isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{selectedChat.isOnline ? t("chat.online") : t("chat.offline")}</p>
                    ) : (
                      <p className="truncate text-xs text-muted-foreground">{selectedChat.role}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <CallButton conversationId={activeChat} otherUserName={selectedChat.name} otherUserAvatar={selectedChat.avatar} autoStartToken={callAutoStart} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button aria-label={t("common.moreOptions")} className="rounded-lg p-2 hover:bg-muted"><MoreVertical className="h-4 w-4 text-muted-foreground" /></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleMenuAction("mute")}>{t("chat.mute")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleMenuAction("block")}>{isBlocked ? t("chat.unblock") : t("chat.block")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleMenuAction("clear")}>{t("chat.clearChat")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleMenuAction("report")} className="text-red-600 dark:text-red-400">{t("chat.report")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
                <div className="mx-auto mb-4 flex max-w-md items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
                  <Lock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <p>{t("chat.privateNotice")}</p>
                </div>

                {isLoadingMessages ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : (
                  <MessageList
                    messages={messages}
                    t={t}
                    onReply={(m) => setReplyTo(m)}
                    onHold={(m) => openOverlay(setSelectedMessage, m)}
                    onOpenMedia={(m) => setOpenMedia(m)}
                  />
                )}
                <div ref={messagesEndRef} />
              </div>

              {isBlocked ? (
                <div className="flex-shrink-0 border-t border-border/60 bg-card p-4 text-center">
                  <p className="text-xs font-semibold text-foreground">{t("chat.blockedTitle", { name: selectedChat.name })}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t("chat.blockedBody")}</p>
                  <Button variant="outline" size="sm" className="mt-3 rounded-xl bg-transparent" onClick={() => handleMenuAction("block")}>
                    {t("chat.unblock")}
                  </Button>
                </div>
              ) : (
              <div className="flex-shrink-0 border-t border-border/60 bg-card p-3">
                {showEmojiPicker && (
                  <div className="mb-2.5 rounded-2xl border border-border/70 bg-muted/70 p-2.5 shadow-sm">
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(emojiMap).map(([key, emoji]) => (
                        <button key={key} onClick={() => { setMessageInput((prev) => prev + emoji); setShowEmojiPicker(false) }} className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-colors hover:bg-background">{emoji}</button>
                      ))}
                    </div>
                  </div>
                )}

                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.txt" />
                <input type="file" ref={imageInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />

                {/* What you're replying to, with a way out of it. */}
                {replyTo && (
                  <div className="mb-2 flex items-start gap-2 rounded-xl border-l-2 border-blue-500 bg-muted/70 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        {replyTo.isMine ? t("chat.replyingToYou") : t("chat.replyingToThem")}
                      </p>
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">{quotePreview(replyTo, t)}</p>
                    </div>
                    <button onClick={() => setReplyTo(null)} aria-label={t("common.cancel")} className="rounded-full p-1 hover:bg-background">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                )}

                {/* Attachments live behind the paperclip now. They used to sit
                    in an always-visible three-button row under the composer,
                    which cost a whole band of vertical space on a phone for
                    controls used a few times a session. */}
                {showAttachMenu && (
                  <div className="mb-2 grid grid-cols-3 gap-2 rounded-2xl border border-border/70 bg-muted/60 p-2">
                    {([
                      [t("chat.quickPhotos"), ImageIcon, "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400", () => imageInputRef.current?.click()],
                      [t("chat.quickFiles"), FileIcon, "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400", () => fileInputRef.current?.click()],
                      [t("chat.quickLocation"), MapPin, "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400", handleShareLocation],
                    ] as const).map(([label, Icon, tint, run]) => (
                      <button
                        key={label}
                        onClick={() => { setShowAttachMenu(false); run() }}
                        className="flex flex-col items-center gap-1 rounded-xl py-2 transition-colors hover:bg-background"
                      >
                        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${tint}`}><Icon className="h-4 w-4" /></span>
                        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {reportNotice && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-muted/70 px-3 py-2">
                    <p className="text-[11px] text-muted-foreground">{reportNotice}</p>
                    <button onClick={() => setReportNotice("")} aria-label={t("common.cancel")} className="rounded-full p-1 hover:bg-background">
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </div>
                )}

                {isRecording ? (
                  <div className="flex items-center gap-3 rounded-full bg-red-50 px-4 py-2.5 dark:bg-red-900/20">
                    <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                    <span className="flex-1 text-sm font-medium text-red-600 dark:text-red-400">{t("chat.recording", { time: `${Math.floor(recordingTime / 60)}:${(recordingTime % 60).toString().padStart(2, "0")}` })}</span>
                    <button onClick={handleStopRecording} aria-label={t("chat.stopRecording")} className="rounded-full bg-red-500 p-2 text-white hover:bg-red-600"><Send className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/60 p-1.5">
                    <button
                      onClick={() => { setShowAttachMenu((v) => !v); setShowEmojiPicker(false) }}
                      aria-label={t("chat.attachFile")}
                      aria-expanded={showAttachMenu}
                      className={`flex-shrink-0 rounded-full p-2 transition-colors hover:bg-background ${showAttachMenu ? "bg-background text-blue-600" : ""}`}
                    >
                      <Paperclip className={`h-5 w-5 ${showAttachMenu ? "text-blue-600" : "text-muted-foreground"}`} />
                    </button>
                    <Input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                      placeholder={t("chat.typeMessage")}
                      className="h-9 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                    <button onClick={() => { setShowEmojiPicker((v) => !v); setShowAttachMenu(false) }} aria-label={t("chat.toggleEmoji")} className="flex-shrink-0 rounded-full p-2 hover:bg-background"><Smile className="h-5 w-5 text-muted-foreground" /></button>
                    {messageInput.trim() ? (
                      <button onClick={handleSendText} aria-label={t("chat.sendMessage")} className="flex-shrink-0 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 text-white shadow-md"><Send className="h-4 w-4" /></button>
                    ) : (
                      <button onClick={handleStartRecording} aria-label={t("chat.startRecording")} className="flex-shrink-0 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 text-white shadow-md"><Mic className="h-4 w-4" /></button>
                    )}
                  </div>
                )}
              </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg"><ShieldCheck className="h-7 w-7" /></div>
              <p className="text-sm text-muted-foreground">{t("chat.selectConversationPrompt")}</p>
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* Held-message actions. A sheet on the bottom edge rather than a menu
          pinned to the bubble: the bubble may be anywhere on screen, and on a
          phone the bottom is the only place a thumb reliably reaches. */}
      {selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onPointerDown={() => setSelectedMessage(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-card p-2 pb-4 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <p className="line-clamp-2 px-3 pb-2 text-[11px] text-muted-foreground">{quotePreview(selectedMessage, t)}</p>
            <button
              onClick={() => { const m = selectedMessage; setSelectedMessage(null); setReplyTo(m) }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted"
            >
              <Reply className="h-4 w-4 text-muted-foreground" /> {t("chat.replyAction")}
            </button>
            {selectedMessage.content && (
              <button onClick={handleCopyMessage} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted">
                <Copy className="h-4 w-4 text-muted-foreground" /> {t("chat.copyAction")}
              </button>
            )}
            {/* Only your own — deleting the other person's words is not on
                offer, and the action would fail server-side anyway. */}
            {selectedMessage.isMine && (
              <button onClick={handleDeleteMessage} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-red-600 hover:bg-muted dark:text-red-400">
                <Trash2 className="h-4 w-4" /> {t("chat.deleteMessageAction")}
              </button>
            )}
            <button onClick={() => setSelectedMessage(null)} className="mt-1 w-full rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Deleting a conversation removes it for both people — there is no
          per-person hide in the data model — so the copy says so plainly. */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onPointerDown={() => setPendingDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{t("chat.deleteChatTitle", { name: pendingDelete.name })}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t("chat.deleteChatBody")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingDelete(null)} className="rounded-xl bg-transparent">{t("common.cancel")}</Button>
              <Button onClick={handleDeleteConversation} className="rounded-xl bg-red-600 text-white hover:bg-red-700">{t("common.delete")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen photo / map, WhatsApp-style. Plain fixed overlay rather
          than a dialog so the media sits on black with nothing around it. */}
      {openMedia && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black" onClick={() => setOpenMedia(null)}>
          <div className="flex flex-shrink-0 justify-end p-4">
            <button
              onClick={() => setOpenMedia(null)}
              aria-label={t("common.close")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-6" onClick={(e) => e.stopPropagation()}>
            {openMedia.type === "IMAGE" ? (
              /* eslint-disable-next-line @next/next/no-img-element -- data: URLs aren't supported by next/image */
              <img src={openMedia.attachmentUrl ?? undefined} alt={openMedia.content ?? ""} className="max-h-full max-w-full object-contain" />
            ) : (() => {
              const coords = parseLatLng(openMedia.content)
              if (!coords) return null
              return (
                <div className="flex w-full max-w-2xl flex-col gap-3">
                  <StaticLocationMap latitude={coords.lat} longitude={coords.lng} label={t("chat.locationShared")} className="h-[60vh] w-full rounded-2xl" />
                  {/* Universal maps URL — hands off to the device's own maps
                      app on mobile, google.com/maps on desktop, so directions
                      work without this app shipping a routing UI. */}
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-white/10 py-2.5 text-center text-sm font-semibold text-white hover:bg-white/20"
                  >
                    {t("chat.openInMaps")}
                  </a>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Why they're reporting. An admin queue full of bare accusations is
          not actionable, so a reason is required before this sends. */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onPointerDown={() => setShowReport(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold text-foreground">{t("chat.reportTitle", { name: selectedChat?.name ?? "" })}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("chat.reportBody")}</p>
            <div className="mt-3 space-y-1.5">
              {([
                t("chat.reportReasonContact"),
                t("chat.reportReasonPayment"),
                t("chat.reportReasonAbuse"),
                t("chat.reportReasonOther"),
              ]).map((reason) => (
                <button
                  key={reason}
                  onClick={() => setReportReason(reason)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                    reportReason === reason ? "border-primary bg-primary/5 font-semibold text-foreground" : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowReport(false)} className="rounded-xl bg-transparent">{t("common.cancel")}</Button>
              <Button onClick={handleSubmitReport} disabled={!reportReason} className="rounded-xl bg-red-600 text-white hover:bg-red-700">
                {t("chat.report")}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

/**
 * One row in the inbox. Press and hold the person's name to delete the
 * conversation — the same gesture on desktop is a right-click, since there is
 * no hold there.
 */
function ConversationRow({
  conversation: c, isActive, onOpen, onRequestDelete,
}: {
  conversation: ConversationSummary
  isActive: boolean
  onOpen: () => void
  onRequestDelete: () => void
}) {
  const { didLongPress, handlers } = useLongPress(onRequestDelete)

  return (
    <button
      {...handlers}
      // Without this the hold that opened the delete prompt also counts as a
      // tap, so the conversation opens behind the dialog.
      onClick={() => { if (!didLongPress()) onOpen() }}
      className={`flex w-full select-none items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-muted/60 ${isActive ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
    >
      <div className="relative flex-shrink-0">
        <Image src={c.avatar || "/placeholder.svg"} alt={c.name} width={48} height={48} className="h-12 w-12 rounded-full object-cover" />
        {c.isOnline === true && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{c.name}</h3>
          <span className="flex-shrink-0 text-[11px] text-muted-foreground">{c.lastMessageAt ? formatRelativeTime(c.lastMessageAt) : ""}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${c.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>{c.lastMessage}</p>
          {c.unreadCount > 0 && <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{c.unreadCount}</span>}
        </div>
      </div>
    </button>
  )
}

/** One row of call history: who, which way it went, when, and how long. */
function CallHistoryRow({
  call, t, onCallBack,
}: {
  call: CallHistoryItem
  t: (key: any, params?: Record<string, string | number>) => string
  onCallBack: () => void
}) {
  const missed = call.outcome !== "COMPLETED"
  const Icon = missed ? PhoneMissed : call.direction === "outgoing" ? PhoneOutgoing : PhoneIncoming

  const duration = (() => {
    if (call.outcome === "DECLINED") return t("chat.callDeclined")
    if (call.outcome === "MISSED") return t("chat.callMissed")
    const m = Math.floor(call.durationSeconds / 60)
    const sec = call.durationSeconds % 60
    return `${m}:${String(sec).padStart(2, "0")}`
  })()

  return (
    <div className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3">
      <div className="relative flex-shrink-0">
        <Image src={call.otherUserAvatar || "/placeholder.svg"} alt={call.otherUserName} width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className={`truncate text-sm font-semibold ${missed ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
          {call.otherUserName}
        </h3>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className={`h-3 w-3 flex-shrink-0 ${missed ? "text-red-500" : "text-emerald-600"}`} />
          <span>{duration}</span>
          <span aria-hidden="true">·</span>
          <span>{formatRelativeTime(call.createdAt)}</span>
        </p>
      </div>
      <button
        onClick={onCallBack}
        aria-label={t("chat.callBack", { name: call.otherUserName })}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600"
      >
        <Phone className="h-4 w-4" />
      </button>
    </div>
  )
}

function dayLabel(iso: string, t: (key: any, params?: Record<string, string | number>) => string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const isSameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (isSameDay(date, today)) return t("chat.today")
  if (isSameDay(date, yesterday)) return t("chat.yesterday")
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined })
}

/** LOCATION messages store their coordinates as the human-readable content
 * string ("-1.2410, 36.8984"), so they're parsed back out here to drive a
 * real map. Returns null for anything that isn't a coordinate pair, which
 * keeps older or malformed messages on the plain text fallback. */
function parseLatLng(content: string | null): { lat: number; lng: number } | null {
  const match = content?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function MessageList({
  messages, t, onReply, onHold, onOpenMedia,
}: {
  messages: ChatMessage[]
  t: (key: any, params?: Record<string, string | number>) => string
  onReply: (m: ChatMessage) => void
  onHold: (m: ChatMessage) => void
  onOpenMedia: (m: ChatMessage) => void
}) {
  if (messages.length === 0) return null
  let lastDay = ""
  return (
    <div className="mx-auto max-w-2xl space-y-1">
      {messages.map((message) => {
        const thisDay = new Date(message.createdAt).toDateString()
        const showDivider = thisDay !== lastDay
        lastDay = thisDay
        return (
          <div key={message.id}>
            {showDivider && (
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">{dayLabel(message.createdAt, t)}</span>
              </div>
            )}
            <MessageRow message={message} t={t} onReply={() => onReply(message)} onHold={() => onHold(message)} onOpenMedia={() => onOpenMedia(message)} />
          </div>
        )
      })}
    </div>
  )
}

/** A one-line description of a quoted message, since a reply can quote a
 *  photo or a voice note as easily as text. */
function quotePreview(m: { type: string; content: string | null }, t: (key: any) => string): string {
  if (m.type === "IMAGE") return t("chat.quickPhotos")
  if (m.type === "FILE") return m.content || t("chat.quickFiles")
  if (m.type === "VOICE") return m.content || t("chat.voiceUnavailable")
  if (m.type === "LOCATION") return t("chat.locationShared")
  return m.content ?? ""
}

function MessageRow({
  message, t, onReply, onHold, onOpenMedia,
}: {
  message: ChatMessage
  t: (key: any, params?: Record<string, string | number>) => string
  onReply: () => void
  onHold: () => void
  onOpenMedia: () => void
}) {
  const swipe = useSwipeToReply(onReply, { mine: message.isMine })
  const press = useLongPress(onHold)

  // A photo or a map is the message. Wrapping it in a coloured bubble with
  // padding made it look like an attachment stuck to a note; every other chat
  // app shows the media itself, so the bubble chrome is dropped for these two
  // and the timestamp is laid over the corner instead.
  const isBareMedia = message.type === "IMAGE" || (message.type === "LOCATION" && parseLatLng(message.content) !== null)

  return (
    <div className={`relative flex ${message.isMine ? "justify-end" : "justify-start"} mb-1.5`}>
      {/* Sits under the bubble and is revealed as it slides away. */}
      <span
        aria-hidden="true"
        style={{ opacity: swipe.progress }}
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground ${message.isMine ? "right-2" : "left-2"}`}
      >
        <Reply className="h-4 w-4" />
      </span>

      <div
        {...press.handlers}
        onTouchStart={(e) => { press.handlers.onTouchStart(e); swipe.handlers.onTouchStart(e) }}
        onTouchMove={(e) => { press.handlers.onTouchMove(e); swipe.handlers.onTouchMove(e) }}
        onTouchEnd={(e) => { press.handlers.onTouchEnd(); swipe.handlers.onTouchEnd() }}
        onTouchCancel={() => { press.handlers.onTouchCancel(); swipe.handlers.onTouchCancel() }}
        style={{
          transform: swipe.offset ? `translateX(${swipe.offset}px)` : undefined,
          // Animate back on release, but follow the finger 1:1 while dragging.
          transition: swipe.offset ? "none" : "transform 160ms ease-out",
        }}
        className={`max-w-[78%] select-none ${
          isBareMedia
            ? "overflow-hidden rounded-2xl"
            : `rounded-2xl px-3.5 py-2.5 ${message.isMine ? "rounded-br-md bg-blue-100 text-slate-900 dark:bg-blue-500/20 dark:text-blue-50" : "rounded-bl-md bg-muted text-foreground"}`
        }`}
      >
        {message.replyTo && (
          <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px] ${message.isMine ? "border-blue-500/70 bg-black/5 dark:bg-white/10" : "border-muted-foreground/40 bg-black/5 dark:bg-white/10"}`}>
            <p className="font-semibold opacity-80">{message.replyTo.isMine ? t("chat.replyingToYou") : t("chat.replyingToThem")}</p>
            <p className="line-clamp-2 opacity-70">{quotePreview(message.replyTo, t)}</p>
          </div>
        )}

        {message.type === "TEXT" && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>}
        {message.type === "IMAGE" && (
          <button type="button" onClick={onOpenMedia} className="relative block" aria-label={message.content || t("chat.sharedAttachmentAlt")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs aren't supported by next/image */}
            {/* Sized by the image, not by the bubble. With the bubble's own
                padding and background removed there is nothing left to give
                `w-full` a width to resolve against, so the photo collapsed to
                the width of its timestamp badge. */}
            <img
              src={message.attachmentUrl ?? undefined}
              alt={message.content || t("chat.sharedAttachmentAlt")}
              className="h-auto max-h-72 w-auto min-w-[8rem] max-w-[65vw] rounded-2xl object-cover sm:max-w-[18rem]"
            />
            <span className="absolute bottom-1.5 right-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white">
              {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {message.isMine && (message.isRead ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3 opacity-70" />)}
            </span>
          </button>
        )}
        {message.type === "FILE" && (
          <div className="flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 dark:bg-white/10">
            <FileIcon className="h-4 w-4 flex-shrink-0" />
            <p className="truncate text-sm font-medium">{message.content}</p>
          </div>
        )}
        {message.type === "VOICE" && (
          <VoiceMessagePlayer
            src={message.attachmentUrl}
            label={message.content ?? ""}
            playLabel={t("chat.playVoiceMessage")}
            pauseLabel={t("chat.pauseVoiceMessage")}
            unavailableLabel={t("chat.voiceUnavailable")}
          />
        )}
        {message.type === "LOCATION" && (() => {
          const coords = parseLatLng(message.content)
          if (!coords) {
            return (
              <div className="space-y-1.5">
                <div className="flex h-28 w-48 items-center justify-center rounded-xl bg-black/10 dark:bg-white/10">
                  <div className="text-center">
                    <MapPin className="mx-auto mb-0.5 h-6 w-6" />
                    <p className="text-xs font-medium">{t("chat.locationShared")}</p>
                  </div>
                </div>
                <p className="text-[10px] opacity-70">{message.content}</p>
              </div>
            )
          }
          return (
            <button type="button" onClick={onOpenMedia} className="relative block" aria-label={t("chat.locationShared")}>
              <StaticLocationMap latitude={coords.lat} longitude={coords.lng} label={t("chat.locationShared")} className="h-44 w-56 rounded-2xl" />
              <span className="absolute bottom-1.5 left-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white">
                <MapPin className="h-3 w-3" /> {t("chat.locationShared")}
              </span>
              <span className="absolute bottom-1.5 right-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white">
                {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                {message.isMine && (message.isRead ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3 opacity-70" />)}
              </span>
            </button>
          )
        })()}
        {!isBareMedia && (
          <div className={`mt-1 flex items-center gap-1 ${message.isMine ? "justify-end" : "justify-start"}`}>
            <span className="text-[10px] opacity-60">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            {message.isMine && (message.isRead ? <CheckCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" /> : <Check className="h-3.5 w-3.5 opacity-50" />)}
          </div>
        )}
      </div>
    </div>
  )
}
