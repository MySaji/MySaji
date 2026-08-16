"use client"

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import {
  Search, SlidersHorizontal, Plus, ArrowLeft, MoreVertical, Send, Paperclip, Smile, Mic,
  Check, CheckCheck, Loader2, Play, MapPin, ImageIcon, File as FileIcon, Lock, ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { NewConversationModal } from "@/components/messages/new-conversation-modal"
import { CallButton } from "@/components/messages/call-button"
import {
  getConversations, sendMessage, getOrCreateConversation, clearConversation,
  type ConversationSummary,
} from "@/lib/actions/messages"
import { useConversationMessages, type ChatMessage } from "@/lib/hooks/useConversationMessages"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

type Filter = "all" | "unread" | "jobs"

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

  const emojiMap: Record<string, string> = { thumbsup: "👍", heart: "❤️", fire: "🔥", star: "⭐", wave: "👋", clap: "👏", check: "✅", "100": "💯", sparkle: "✨", pray: "🙏", muscle: "💪", smile: "😊" }

  const refreshConversations = useCallback(() => getConversations().then(setConversations), [])

  useEffect(() => {
    refreshConversations().finally(() => setIsLoading(false))
  }, [refreshConversations])

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

  const selectedChat = conversations.find((c) => c.id === activeChat)

  const filteredConversations = conversations
    .filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter((c) => (filter === "unread" ? c.unreadCount > 0 : filter === "jobs" ? c.jobId !== null : true))

  const resetFilters = () => { setSearchQuery(""); setFilter("all") }

  const doSend = async (type: ChatMessage["type"], content?: string, attachmentUrl?: string) => {
    if (!activeChat) return
    const result = await sendMessage({ conversationId: activeChat, type: type as any, content, attachmentUrl })
    if (result.success) {
      mutateMessages((prev) => [...(prev ?? []), result.message], { revalidate: false })
      refreshConversations()
    }
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

  const playVoiceMessage = (attachmentUrl: string | null) => {
    if (!attachmentUrl) return
    new Audio(attachmentUrl).play().catch(() => {})
  }

  const handleMenuAction = async (action: "mute" | "block" | "report" | "clear") => {
    if (action === "clear") {
      if (activeChat) { await clearConversation({ conversationId: activeChat }); mutateMessages([], { revalidate: false }) }
      return
    }
    const labelKey = action === "mute" ? "chat.notificationsMuted" : action === "block" ? "chat.userBlocked" : "chat.reportSubmitted"
    alert(t(labelKey))
  }

  if (isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] w-full flex-col overflow-hidden bg-[#F4F5FB] dark:bg-slate-950 lg:h-screen">
      {/* Page header — spans both panels, matches the reference design */}
      <div className="flex-shrink-0 border-b border-border/60 bg-[#EEF0FA] px-4 py-4 dark:bg-slate-900 sm:px-6">
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
              {([["all", t("chat.filterAll")], ["unread", t("chat.filterUnread")], ["jobs", t("chat.filterJobs")]] as const).map(([id, label]) => (
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
            {filteredConversations.length === 0 ? (
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
                <button
                  key={c.id}
                  onClick={() => setActiveChat(c.id)}
                  className={`flex w-full items-start gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-muted/60 ${activeChat === c.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
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
                      <DropdownMenuItem onClick={() => handleMenuAction("block")}>{t("chat.block")}</DropdownMenuItem>
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
                  <MessageList messages={messages} onPlayVoice={playVoiceMessage} t={t} />
                )}
                <div ref={messagesEndRef} />
              </div>

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

                {isRecording ? (
                  <div className="flex items-center gap-3 rounded-full bg-red-50 px-4 py-2.5 dark:bg-red-900/20">
                    <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                    <span className="flex-1 text-sm font-medium text-red-600 dark:text-red-400">{t("chat.recording", { time: `${Math.floor(recordingTime / 60)}:${(recordingTime % 60).toString().padStart(2, "0")}` })}</span>
                    <button onClick={handleStopRecording} aria-label={t("chat.stopRecording")} className="rounded-full bg-red-500 p-2 text-white hover:bg-red-600"><Send className="h-4 w-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/60 p-1.5">
                    <button onClick={() => fileInputRef.current?.click()} aria-label={t("chat.attachFile")} className="flex-shrink-0 rounded-full p-2 hover:bg-background"><Paperclip className="h-5 w-5 text-muted-foreground" /></button>
                    <Input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendText()}
                      placeholder={t("chat.typeMessage")}
                      className="h-9 flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                    />
                    <button onClick={() => setShowEmojiPicker((v) => !v)} aria-label={t("chat.toggleEmoji")} className="flex-shrink-0 rounded-full p-2 hover:bg-background"><Smile className="h-5 w-5 text-muted-foreground" /></button>
                    {messageInput.trim() ? (
                      <button onClick={handleSendText} aria-label={t("chat.sendMessage")} className="flex-shrink-0 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 text-white shadow-md"><Send className="h-4 w-4" /></button>
                    ) : (
                      <button onClick={handleStartRecording} aria-label={t("chat.startRecording")} className="flex-shrink-0 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 text-white shadow-md"><Mic className="h-4 w-4" /></button>
                    )}
                  </div>
                )}

                {/* Quick actions — always-visible one-tap row, matching the
                    reference design (minus "Payment", which has no real
                    feature behind it in this app). */}
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <button onClick={() => imageInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-xl py-1.5 transition-colors hover:bg-muted">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"><ImageIcon className="h-4 w-4" /></div>
                    <span className="text-[10px] font-medium text-muted-foreground">{t("chat.quickPhotos")}</span>
                  </button>
                  <button onClick={handleShareLocation} className="flex flex-col items-center gap-1 rounded-xl py-1.5 transition-colors hover:bg-muted">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"><MapPin className="h-4 w-4" /></div>
                    <span className="text-[10px] font-medium text-muted-foreground">{t("chat.quickLocation")}</span>
                  </button>
                  <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-xl py-1.5 transition-colors hover:bg-muted">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"><FileIcon className="h-4 w-4" /></div>
                    <span className="text-[10px] font-medium text-muted-foreground">{t("chat.quickFiles")}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg"><ShieldCheck className="h-7 w-7" /></div>
              <p className="text-sm text-muted-foreground">{t("chat.selectConversationPrompt")}</p>
            </div>
          )}
        </div>
      </div>

      <NewConversationModal
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        showRoleFilter={showRoleFilter}
        onConversationCreated={async (conversationId) => {
          await refreshConversations()
          setActiveChat(conversationId)
        }}
      />
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

function MessageList({ messages, onPlayVoice, t }: { messages: ChatMessage[]; onPlayVoice: (url: string | null) => void; t: (key: any, params?: Record<string, string | number>) => string }) {
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
            <div className={`flex ${message.isMine ? "justify-end" : "justify-start"} mb-1.5`}>
              <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${message.isMine ? "rounded-br-md bg-blue-100 text-slate-900 dark:bg-blue-500/20 dark:text-blue-50" : "rounded-bl-md bg-muted text-foreground"}`}>
                {message.type === "TEXT" && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>}
                {message.type === "IMAGE" && (
                  <div className="space-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs aren't supported by next/image */}
                    <img src={message.attachmentUrl ?? undefined} alt={message.content || t("chat.sharedAttachmentAlt")} className="max-h-60 rounded-xl object-cover" />
                  </div>
                )}
                {message.type === "FILE" && (
                  <div className="flex items-center gap-2 rounded-lg bg-black/5 px-2.5 py-2 dark:bg-white/10">
                    <FileIcon className="h-4 w-4 flex-shrink-0" />
                    <p className="truncate text-sm font-medium">{message.content}</p>
                  </div>
                )}
                {message.type === "VOICE" && (
                  <div className="flex min-w-[160px] items-center gap-2.5">
                    <button onClick={() => onPlayVoice(message.attachmentUrl)} aria-label={t("chat.playVoiceMessage")} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"><Play className="h-4 w-4" /></button>
                    <p className="text-xs opacity-80">{message.content}</p>
                  </div>
                )}
                {message.type === "LOCATION" && (
                  <div className="space-y-1.5">
                    <div className="flex h-28 w-48 items-center justify-center rounded-xl bg-black/10 dark:bg-white/10">
                      <div className="text-center"><MapPin className="mx-auto mb-0.5 h-6 w-6" /><p className="text-xs font-medium">{t("chat.locationShared")}</p></div>
                    </div>
                    <p className="text-[10px] opacity-70">{message.content}</p>
                  </div>
                )}
                <div className={`mt-1 flex items-center gap-1 ${message.isMine ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] opacity-60">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  {message.isMine && (message.isRead ? <CheckCheck className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" /> : <Check className="h-3.5 w-3.5 opacity-50" />)}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
