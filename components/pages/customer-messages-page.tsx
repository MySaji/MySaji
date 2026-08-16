"use client"

import type React from "react"
import { useState, useRef, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Send, Search, Check, CheckCheck, Paperclip, Smile, Mic,
  ImageIcon, MapPin, MoreVertical, ArrowLeft, Camera, File, Play,
  Sparkles, ShieldCheck, Settings2, Loader2, SquarePen
} from "lucide-react"
import { NewConversationModal } from "@/components/messages/new-conversation-modal"
import { CallButton } from "@/components/messages/call-button"
import Image from "next/image"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getConversations, sendMessage, getOrCreateConversation,
  getChatTheme, updateChatTheme, clearConversation,
  type ConversationSummary,
} from "@/lib/actions/messages"
import { useConversationMessages, type ChatMessage } from "@/lib/hooks/useConversationMessages"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

type ChatTheme = "classic" | "aurora" | "midnight" | "sunset"
const THEME_TO_DB: Record<ChatTheme, string> = { classic: "CLASSIC", aurora: "AURORA", midnight: "MIDNIGHT", sunset: "SUNSET" }
const THEME_FROM_DB: Record<string, ChatTheme> = { CLASSIC: "classic", AURORA: "aurora", MIDNIGHT: "midnight", SUNSET: "sunset" }

export function CustomerMessagesPage() {
  const { t } = useLocalization()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState("")
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [callAutoStart, setCallAutoStart] = useState<number | undefined>(undefined)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [chatTheme, setChatTheme] = useState<ChatTheme>("classic")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordingTimeRef = useRef(0)
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { messages, mutateMessages, isLoadingMessages } = useConversationMessages(selectedChat)

  const chatThemeOptions: { id: ChatTheme; label: string; description: string }[] = [
    { id: "classic", label: t("customer.messages.themeClassic"), description: t("customer.messages.themeClassicDesc") },
    { id: "aurora", label: t("customer.messages.themeAurora"), description: t("customer.messages.themeAuroraDesc") },
    { id: "midnight", label: t("customer.messages.themeMidnight"), description: t("customer.messages.themeMidnightDesc") },
    { id: "sunset", label: t("customer.messages.themeSunset"), description: t("customer.messages.themeSunsetDesc") },
  ]

  const emojis = ["thumbsup", "heart", "fire", "star", "wave", "clap", "check", "100", "sparkle", "pray", "muscle", "smile"]
  const emojiMap: Record<string, string> = { thumbsup: "👍", heart: "❤️", fire: "🔥", star: "⭐", wave: "👋", clap: "👏", check: "✅", "100": "💯", sparkle: "✨", pray: "🙏", muscle: "💪", smile: "😊" }

  const brandGradient = "from-sky-600 via-blue-600 to-violet-600"
  const brandSurface = "bg-gradient-to-r from-sky-600/10 via-blue-600/10 to-violet-600/10"

  const refreshConversations = useCallback(() => getConversations().then(setConversations), [])

  useEffect(() => {
    getChatTheme().then((dbTheme) => setChatTheme(THEME_FROM_DB[dbTheme] ?? "classic"))
    refreshConversations().finally(() => setIsLoading(false))
  }, [refreshConversations])

  useEffect(() => {
    updateChatTheme({ theme: THEME_TO_DB[chatTheme] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTheme])

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }
  useEffect(() => { scrollToBottom() }, [messages])

  const filteredConversations = conversations.filter(conv => conv.name.toLowerCase().includes(searchQuery.toLowerCase()))
  const selectedConversation = conversations.find(c => c.id === selectedChat)

  useEffect(() => {
    const conversationParam = searchParams.get("conversation")
    if (conversationParam) setSelectedChat(conversationParam)
  }, [searchParams])

  useEffect(() => {
    const providerParam = searchParams.get("provider")
    const actionParam = searchParams.get("action")
    if (!providerParam) return

    getOrCreateConversation({ otherUserId: providerParam }).then(async (result) => {
      if (!result.success) return
      await refreshConversations()
      setSelectedChat(result.conversationId)

      if (actionParam === "call") setCallAutoStart(Date.now())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleSendMessage = async (type: "TEXT" | "IMAGE" | "FILE" | "LOCATION" | "VOICE" = "TEXT", content?: string, attachmentUrl?: string) => {
    if (!selectedChat) return
    if (type === "TEXT" && !messageInput.trim()) return

    const textToSend = type === "TEXT" ? messageInput : content
    setMessageInput("")
    setShowAttachMenu(false)

    const result = await sendMessage({ conversationId: selectedChat, type, content: textToSend, attachmentUrl })
    if (result.success) {
      mutateMessages((prev) => [...(prev ?? []), result.message], { revalidate: false })
      refreshConversations()
    }
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
      mediaRecorder.ondataavailable = (event) => { audioChunksRef.current.push(event.data) }
      mediaRecorder.onstop = () => {
        const minutes = Math.floor(recordingTimeRef.current / 60)
        const seconds = recordingTimeRef.current % 60
        const label = t("customer.messages.voiceMessageLabel", { time: `${minutes}:${seconds.toString().padStart(2, '0')}` })
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        const reader = new FileReader()
        reader.onloadend = () => { handleSendMessage("VOICE", label, reader.result as string) }
        reader.readAsDataURL(blob)
        stream.getTracks().forEach(track => track.stop())
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current)
      }
      mediaRecorder.start(); setIsRecording(true)
    } catch { alert(t("customer.messages.allowMicrophone")) }
  }

  const handleStopRecording = () => { if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); setIsRecording(false) } }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => { handleSendMessage("FILE", `${file.name} (${(file.size / 1024).toFixed(1)} KB)`, reader.result as string) }
      reader.readAsDataURL(file)
    }
    e.target.value = ''
  }
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { const reader = new FileReader(); reader.onloadend = () => { handleSendMessage("IMAGE", file.name, reader.result as string) }; reader.readAsDataURL(file) }
    e.target.value = ''
  }
  const handleShareLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        handleSendMessage("LOCATION", `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`)
        setShowAttachMenu(false)
      }, () => alert(t("customer.messages.enableLocation")))
    }
  }

  const getStatusIcon = (isRead: boolean) => {
    if (isRead) return <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
    return <Check className="w-3.5 h-3.5 text-muted-foreground" />
  }

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`

  const handleMoreMenuAction = async (action: string) => {
    switch (action) {
      case "block": alert(t("customer.messages.userBlocked")); break
      case "mute": alert(t("customer.messages.notificationsMuted")); break
      case "report": alert(t("customer.community.reportSubmitted")); break
      case "clear":
        if (selectedChat) { await clearConversation({ conversationId: selectedChat }); mutateMessages([], { revalidate: false }) }
        break
    }
    setShowMoreMenu(false)
  }

  const playVoiceMessage = (attachmentUrl: string | null) => {
    if (!attachmentUrl) return
    new Audio(attachmentUrl).play().catch(() => {})
  }

  const themeStyles = {
    classic: {
      shell: "bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.12),_transparent_35%),linear-gradient(135deg,_rgba(255,255,255,0.95),_rgba(248,250,252,0.95))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.16),_transparent_35%),linear-gradient(135deg,_rgba(3,7,18,0.96),_rgba(15,23,42,0.96))]",
      sidebar: "bg-background/75",
      chat: "bg-background/70",
      header: "bg-background/80",
      input: "bg-background/95",
      sentBubble: `bg-gradient-to-r ${brandGradient} text-primary-foreground rounded-br-lg`,
      receivedBubble: "rounded-bl-lg border border-border/70 bg-card/95",
      surface: brandSurface,
      accent: brandGradient,
    },
    aurora: {
      shell: "bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.2),_transparent_32%),linear-gradient(135deg,_rgba(248,250,252,1),_rgba(224,231,255,1))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_36%),linear-gradient(135deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]",
      sidebar: "bg-white/80 dark:bg-slate-900/70 backdrop-blur",
      chat: "bg-white/70 dark:bg-slate-900/60 backdrop-blur",
      header: "bg-white/80 dark:bg-slate-900/80 backdrop-blur",
      input: "bg-white/90 dark:bg-slate-900/90 backdrop-blur",
      sentBubble: "bg-gradient-to-r from-violet-600 to-sky-600 text-white rounded-br-lg",
      receivedBubble: "rounded-bl-lg border border-slate-200/80 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-800/80",
      surface: "bg-gradient-to-r from-violet-600/10 via-sky-600/10 to-cyan-600/10",
      accent: "from-violet-600 via-sky-600 to-cyan-600",
    },
    midnight: {
      shell: "bg-[linear-gradient(135deg,_rgba(15,23,42,1),_rgba(30,41,59,1))]",
      sidebar: "bg-slate-900/80 backdrop-blur",
      chat: "bg-slate-950/70 backdrop-blur",
      header: "bg-slate-900/80 backdrop-blur",
      input: "bg-slate-900/90 backdrop-blur",
      sentBubble: "bg-cyan-600 text-white rounded-br-lg",
      receivedBubble: "rounded-bl-lg border border-slate-700 bg-slate-800/90",
      surface: "bg-gradient-to-r from-cyan-600/10 via-slate-700/10 to-slate-600/10",
      accent: "from-cyan-600 via-slate-700 to-slate-600",
    },
    sunset: {
      shell: "bg-[linear-gradient(135deg,_rgba(255,247,237,1),_rgba(254,215,170,1))] dark:bg-[linear-gradient(135deg,_rgba(69,26,3,1),_rgba(120,53,15,1))]",
      sidebar: "bg-white/80 dark:bg-amber-950/70 backdrop-blur",
      chat: "bg-white/70 dark:bg-amber-950/60 backdrop-blur",
      header: "bg-white/80 dark:bg-amber-950/80 backdrop-blur",
      input: "bg-white/90 dark:bg-amber-950/90 backdrop-blur",
      sentBubble: "bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-br-lg",
      receivedBubble: "rounded-bl-lg border border-orange-200/80 bg-orange-50/90 dark:border-amber-800 dark:bg-amber-900/80",
      surface: "bg-gradient-to-r from-orange-500/10 via-rose-500/10 to-amber-500/10",
      accent: "from-orange-500 via-rose-500 to-amber-500",
    },
  }[chatTheme]

  const renderMessage = (message: ChatMessage) => {
    const isCustomer = message.isMine
    const timestamp = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    return (
      <div key={message.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"} mb-2`}>
        <div className={`max-w-[75%]`}>
          <div className={`rounded-[20px] px-3.5 py-2.5 shadow-sm ${isCustomer ? themeStyles.sentBubble : themeStyles.receivedBubble}`}>
            {message.type === "TEXT" && <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>}
            {message.type === "IMAGE" && (
              <div className="space-y-1.5">
                <div className="relative w-48 h-36 rounded-xl overflow-hidden"><Image src={message.attachmentUrl || "/placeholder.svg"} alt={message.content || "Image"} fill className="object-cover" /></div>
                {message.content && <p className="text-xs opacity-80">{message.content}</p>}
              </div>
            )}
            {message.type === "FILE" && (
              <div className="flex items-center gap-2.5 p-2 bg-background/10 rounded-xl">
                <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0"><File className="w-4 h-4 text-white" /></div>
                <p className="text-sm font-medium truncate">{message.content}</p>
              </div>
            )}
            {message.type === "VOICE" && (
              <div className="flex items-center gap-2.5 min-w-[160px]">
                <button onClick={() => playVoiceMessage(message.attachmentUrl)} className="w-9 h-9 rounded-full bg-background/20 flex items-center justify-center hover:bg-background/30 transition-colors flex-shrink-0"><Play className="w-4 h-4" /></button>
                <div className="flex-1"><div className="h-1 bg-background/30 rounded-full"><div className="h-full w-0 bg-current rounded-full" /></div><p className="text-[10px] mt-0.5 opacity-70">{message.content}</p></div>
              </div>
            )}
            {message.type === "LOCATION" && (
              <div className="space-y-1.5"><div className="w-48 h-28 rounded-xl bg-emerald-600/20 flex items-center justify-center"><div className="text-center"><MapPin className="w-6 h-6 mx-auto mb-0.5" /><p className="text-xs font-medium">{t("customer.messages.locationShared")}</p></div></div><p className="text-[10px] opacity-70">{message.content}</p></div>
            )}
            <div className={`flex items-center gap-1 mt-1 ${isCustomer ? "justify-end" : "justify-start"}`}>
              <span className="text-[10px] opacity-60">{timestamp}</span>
              {isCustomer && getStatusIcon(message.isRead)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className={`flex h-[calc(100vh-4rem)] w-full ${themeStyles.shell} lg:h-screen lg:overflow-hidden lg:px-3 lg:py-3`}>
      {/* Conversations Sidebar */}
      <div className={`flex w-full flex-col border-r border-border/70 ${themeStyles.sidebar} backdrop-blur-sm lg:w-[380px] ${selectedChat !== null ? "hidden lg:flex" : "flex"} lg:rounded-l-[32px]`}>
        <div className={`border-b border-border/70 p-4 ${themeStyles.surface}`}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">{t("customer.messages.inbox")}</h1>
              <p className="text-sm text-muted-foreground">{t("customer.messages.subtitle")}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewChat(true)}
                title={t("customer.messages.newMessage")}
                className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${themeStyles.accent} text-white shadow-lg`}
              >
                <SquarePen className="h-4 w-4" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label={t("customer.messages.chatSettings")} className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${themeStyles.accent} text-white shadow-lg`}>
                    <Settings2 className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{t("customer.messages.chatSettings")}</p>
                  <div className="space-y-2">
                    {chatThemeOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setChatTheme(option.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${chatTheme === option.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
                      >
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${themeStyles.accent} text-white shadow-lg`}>
                <Sparkles className="h-5 w-5" />
              </div>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder={t("customer.messages.searchConversations")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-11 rounded-2xl border-0 bg-background/80 pl-9 shadow-sm" />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2">
          {filteredConversations.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">{t("customer.messages.noConversations")}</div>
          )}
          {filteredConversations.map(conv => (
            <button key={conv.id} onClick={() => setSelectedChat(conv.id)}
              className={`mb-2 flex w-full gap-3 rounded-2xl border px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:bg-muted/70 ${selectedChat === conv.id ? "border-primary/30 bg-primary/5 shadow-sm" : "border-transparent bg-background/70"}`}
            >
              <div className="relative flex-shrink-0">
                <Image src={conv.avatar || "/placeholder.svg"} alt={conv.name} width={48} height={48} className="rounded-full object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold text-foreground">{conv.name}</h3>
                  <span className="text-[11px] text-muted-foreground">{conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ""}</span>
                </div>
                <div className="mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  <p className="truncate text-[11px] text-muted-foreground">{conv.role}</p>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={`truncate text-sm ${conv.unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>{conv.lastMessage}</p>
                  {conv.unreadCount > 0 && <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{conv.unreadCount}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`flex flex-1 flex-col ${selectedChat === null ? "hidden lg:flex" : "flex"} lg:rounded-r-[32px] lg:border-l lg:border-border/70 lg:bg-background/70`}>
        {selectedChat && selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className={`flex items-center justify-between border-b border-border/70 ${themeStyles.header} px-3 py-3 backdrop-blur sm:px-4 ${themeStyles.surface}`}>
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedChat(null)} aria-label={t("common.back")} className="rounded-xl p-1.5 hover:bg-muted lg:hidden"><ArrowLeft className="h-5 w-5" /></button>
                <div className="relative">
                  <Image src={selectedConversation.avatar || "/placeholder.svg"} alt="" width={40} height={40} className="rounded-full object-cover" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-foreground">{selectedConversation.name}</h2>
                    <span className={`rounded-full bg-gradient-to-r ${brandGradient} px-2 py-0.5 text-[10px] font-semibold text-white`}>{t("customer.messages.premiumBadge")}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{selectedConversation.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <CallButton conversationId={selectedChat} otherUserName={selectedConversation?.name ?? t("customer.messages.userFallback")} otherUserAvatar={selectedConversation?.avatar} autoStartToken={callAutoStart} />
                <Popover open={showMoreMenu} onOpenChange={setShowMoreMenu}>
                  <PopoverTrigger asChild><button aria-label={t("customer.messages.moreOptions")} className="rounded-xl p-2 transition-colors hover:bg-muted"><MoreVertical className="h-4 w-4 text-muted-foreground" /></button></PopoverTrigger>
                  <PopoverContent align="end" className="w-44 rounded-2xl p-1">
                    <button onClick={() => handleMoreMenuAction("mute")} className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted">{t("customer.messages.mute")}</button>
                    <button onClick={() => handleMoreMenuAction("block")} className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted">{t("customer.messages.block")}</button>
                    <button onClick={() => handleMoreMenuAction("clear")} className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-muted">{t("customer.messages.clearChat")}</button>
                    <button onClick={() => handleMoreMenuAction("report")} className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">{t("customer.community.report")}</button>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Messages */}
            <div className={`flex-1 overflow-y-auto bg-gradient-to-b from-muted/20 to-background/40 p-4 ${themeStyles.shell}`}>
              {isLoadingMessages ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : messages.length === 0 ? (
                <div className="mb-4 text-center"><span className="rounded-full bg-background/80 px-3 py-1 text-[11px] text-muted-foreground shadow-sm">{t("customer.live.noMessagesYet")}</span></div>
              ) : (
                messages.map(renderMessage)
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className={`border-t border-border/70 ${themeStyles.input} p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur`}>
              {showEmojiPicker && (
                <div className="mb-2.5 rounded-2xl border border-border/70 bg-muted/70 p-2.5 shadow-sm">
                  <div className="flex flex-wrap gap-1.5">
                    {emojis.map(key => (
                      <button key={key} onClick={() => { setMessageInput(prev => prev + emojiMap[key]); setShowEmojiPicker(false) }} className="text-xl w-9 h-9 rounded-lg hover:bg-background flex items-center justify-center transition-colors">{emojiMap[key]}</button>
                    ))}
                  </div>
                </div>
              )}

              {showAttachMenu && (
                <div className="mb-2.5 rounded-2xl border border-border/70 bg-muted/70 p-2.5 shadow-sm">
                  <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => imageInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-2xl p-2.5 transition-colors hover:bg-background">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500"><ImageIcon className="h-5 w-5 text-white" /></div>
                      <span className="text-[10px] text-muted-foreground">{t("customer.messages.gallery")}</span>
                    </button>
                    <button onClick={() => imageInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-2xl p-2.5 transition-colors hover:bg-background">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-pink-500"><Camera className="h-5 w-5 text-white" /></div>
                      <span className="text-[10px] text-muted-foreground">{t("customer.messages.camera")}</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center gap-1 rounded-2xl p-2.5 transition-colors hover:bg-background">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500"><File className="h-5 w-5 text-white" /></div>
                      <span className="text-[10px] text-muted-foreground">{t("customer.messages.file")}</span>
                    </button>
                    <button onClick={handleShareLocation} className="flex flex-col items-center gap-1 rounded-2xl p-2.5 transition-colors hover:bg-background">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500"><MapPin className="h-5 w-5 text-white" /></div>
                      <span className="text-[10px] text-muted-foreground">{t("customer.messages.locationOption")}</span>
                    </button>
                  </div>
                </div>
              )}

              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".pdf,.doc,.docx,.txt,.xlsx" />
              <input type="file" ref={imageInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />

              {isRecording ? (
                <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 rounded-xl px-4 py-2.5">
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="flex-1 text-red-600 dark:text-red-400 text-sm font-medium">{t("customer.messages.recording", { time: formatTime(recordingTime) })}</span>
                  <button onClick={handleStopRecording} aria-label={t("customer.messages.stopRecording")} className="p-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"><Send className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className={`flex items-center gap-2 rounded-[24px] border border-border/70 bg-muted/70 p-2 shadow-sm sm:rounded-[28px] ${brandSurface}`}>
                  <button onClick={() => { setShowAttachMenu(!showAttachMenu); setShowEmojiPicker(false) }} aria-label={t("customer.messages.attachFile")} className="flex-shrink-0 rounded-2xl p-2 transition-colors hover:bg-background"><Paperclip className="h-5 w-5 text-muted-foreground" /></button>
                  <div className="relative flex-1">
                    <Input value={messageInput} onChange={(e) => setMessageInput(e.target.value)} placeholder={t("customer.messages.typeAMessage")} className="h-11 rounded-2xl border-0 bg-background/80 pr-10 shadow-inner" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()} />
                    <button onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowAttachMenu(false) }} aria-label={t("customer.messages.toggleEmoji")} className="absolute right-3 top-1/2 -translate-y-1/2"><Smile className="h-5 w-5 text-muted-foreground transition-colors hover:text-foreground" /></button>
                  </div>
                  {messageInput.trim() ? (
                    <button onClick={() => handleSendMessage()} aria-label={t("customer.messages.sendMessage")} className={`flex-shrink-0 rounded-2xl bg-gradient-to-r ${brandGradient} p-2.5 text-primary-foreground shadow-lg transition-colors`}><Send className="h-4 w-4" /></button>
                  ) : (
                    <button onClick={handleStartRecording} aria-label={t("customer.messages.startRecording")} className={`flex-shrink-0 rounded-2xl bg-gradient-to-r ${brandGradient} p-2.5 text-primary-foreground shadow-lg transition-colors`}><Mic className="h-4 w-4" /></button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={`flex flex-1 items-center justify-center bg-gradient-to-br from-muted/20 to-background/40 p-6 ${themeStyles.shell}`}>
            <div className={`max-w-md rounded-[28px] border border-border/70 bg-background/80 p-8 text-center shadow-xl backdrop-blur ${brandSurface}`}>
              <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br ${brandGradient} text-white shadow-lg`}>
                <Send className="h-8 w-8" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">{t("customer.messages.yourMessages")}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{t("customer.messages.selectConversationHint")}</p>
            </div>
          </div>
        )}
      </div>

      <NewConversationModal
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        onConversationCreated={async (conversationId) => {
          await refreshConversations()
          setSelectedChat(conversationId)
        }}
      />
    </div>
  )
}
