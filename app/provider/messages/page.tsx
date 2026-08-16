"use client"

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import {
  Search, MoreVertical, Send, Paperclip, ImageIcon, Clock,
  Check, CheckCheck, ArrowLeft, Info, X, MessageSquareOff, Bot, Moon,
  Settings2, Sparkles, ShieldCheck, MessageSquareText, Loader2, MapPin, Play, SquarePen,
} from "lucide-react"
import { NewConversationModal } from "@/components/messages/new-conversation-modal"
import { CallButton } from "@/components/messages/call-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Image from "next/image"
import {
  getConversations, sendMessage, getOrCreateConversation,
  getChatTheme, updateChatTheme, clearConversation,
  type ConversationSummary,
} from "@/lib/actions/messages"
import { useConversationMessages } from "@/lib/hooks/useConversationMessages"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

type ChatTheme = "classic" | "aurora" | "midnight" | "sunset"
const THEME_TO_DB: Record<ChatTheme, string> = { classic: "CLASSIC", aurora: "AURORA", midnight: "MIDNIGHT", sunset: "SUNSET" }
const THEME_FROM_DB: Record<string, ChatTheme> = { CLASSIC: "classic", AURORA: "aurora", MIDNIGHT: "midnight", SUNSET: "sunset" }

export default function ProviderMessagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ProviderMessagesContent />
    </Suspense>
  )
}

function ProviderMessagesContent() {
  const { t } = useLocalization()
  const searchParams = useSearchParams()
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [callAutoStart, setCallAutoStart] = useState<number | undefined>(undefined)
  const [showAutoReplyPanel, setShowAutoReplyPanel] = useState(false)
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(false)
  const [chatTheme, setChatTheme] = useState<ChatTheme>("classic")
  const [awayMode, setAwayMode] = useState<"off" | "busy" | "vacation" | "sleep">("off")
  const [autoReplyMessage, setAutoReplyMessage] = useState(t("provider.messages.defaultAutoReplyMessage"))
  const [attachmentPreview, setAttachmentPreview] = useState<{ type: "image" | "file"; name: string; dataUrl?: string } | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { messages, mutateMessages, isLoadingMessages } = useConversationMessages(activeChat)

  const chatThemeOptions: { id: ChatTheme; label: string; description: string }[] = [
    { id: "classic", label: t("provider.messages.themeClassic"), description: t("provider.messages.themeClassicDesc") },
    { id: "aurora", label: t("provider.messages.themeAurora"), description: t("provider.messages.themeAuroraDesc") },
    { id: "midnight", label: t("provider.messages.themeMidnight"), description: t("provider.messages.themeMidnightDesc") },
    { id: "sunset", label: t("provider.messages.themeSunset"), description: t("provider.messages.themeSunsetDesc") },
  ]

  const awayPresets = [
    { id: "busy" as const, label: t("provider.messages.presetBusyLabel"), icon: MessageSquareOff, message: t("provider.messages.presetBusyMessage") },
    { id: "vacation" as const, label: t("provider.messages.presetVacationLabel"), icon: Moon, message: t("provider.messages.presetVacationMessage") },
    { id: "sleep" as const, label: t("provider.messages.presetAfterHoursLabel"), icon: Clock, message: t("provider.messages.presetAfterHoursMessage") },
  ]

  const refreshConversations = useCallback(() => getConversations().then(setConversations), [])

  useEffect(() => {
    getChatTheme().then((dbTheme) => setChatTheme(THEME_FROM_DB[dbTheme] ?? "classic"))
    refreshConversations().finally(() => setIsLoading(false))
  }, [refreshConversations])

  useEffect(() => {
    updateChatTheme({ theme: THEME_TO_DB[chatTheme] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTheme])

  useEffect(() => {
    const conversationParam = searchParams.get("conversation")
    if (conversationParam) setActiveChat(conversationParam)
  }, [searchParams])

  useEffect(() => {
    const clientParam = searchParams.get("client")
    const actionParam = searchParams.get("action")
    if (!clientParam) return

    getOrCreateConversation({ otherUserId: clientParam }).then(async (result) => {
      if (!result.success) return
      await refreshConversations()
      setActiveChat(result.conversationId)

      if (actionParam === "call") setCallAutoStart(Date.now())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  const selectedChat = conversations.find((conversation) => conversation.id === activeChat)
  const filteredConversations = conversations.filter((conversation) => conversation.name.toLowerCase().includes(searchQuery.toLowerCase()))

  const themeStyles = {
    classic: {
      shell: "bg-gray-50 dark:bg-gray-900",
      sidebar: "bg-white dark:bg-gray-800",
      header: "bg-white dark:bg-gray-800",
      composer: "bg-white dark:bg-gray-800",
      sentBubble: "bg-emerald-600 text-white rounded-br-none",
      receivedBubble: "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none",
      accent: "bg-emerald-600",
      border: "border-gray-200 dark:border-gray-700",
    },
    aurora: {
      shell: "bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.16),_transparent_32%),linear-gradient(135deg,_rgba(248,250,252,1),_rgba(224,231,255,1))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_36%),linear-gradient(135deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]",
      sidebar: "bg-white/80 dark:bg-slate-900/80 backdrop-blur",
      header: "bg-white/80 dark:bg-slate-900/80 backdrop-blur",
      composer: "bg-white/80 dark:bg-slate-900/80 backdrop-blur",
      sentBubble: "bg-gradient-to-r from-violet-600 to-sky-600 text-white rounded-br-none",
      receivedBubble: "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none",
      accent: "bg-gradient-to-r from-violet-600 to-sky-600",
      border: "border-slate-200 dark:border-slate-700",
    },
    midnight: {
      shell: "bg-slate-950",
      sidebar: "bg-slate-900 border-slate-800",
      header: "bg-slate-900 border-slate-800",
      composer: "bg-slate-900 border-slate-800",
      sentBubble: "bg-cyan-600 text-white rounded-br-none",
      receivedBubble: "bg-slate-800 text-slate-100 rounded-bl-none",
      accent: "bg-cyan-600",
      border: "border-slate-800",
    },
    sunset: {
      shell: "bg-[linear-gradient(135deg,_rgba(255,247,237,1),_rgba(254,215,170,1))] dark:bg-[linear-gradient(135deg,_rgba(69,26,3,1),_rgba(120,53,15,1))]",
      sidebar: "bg-white/90 dark:bg-amber-950/80 backdrop-blur",
      header: "bg-white/90 dark:bg-amber-950/80 backdrop-blur",
      composer: "bg-white/90 dark:bg-amber-950/80 backdrop-blur",
      sentBubble: "bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-br-none",
      receivedBubble: "bg-orange-50 dark:bg-amber-900/50 text-orange-950 dark:text-orange-100 rounded-bl-none",
      accent: "bg-gradient-to-r from-orange-500 to-rose-500",
      border: "border-orange-200 dark:border-amber-800",
    },
  }[chatTheme]

  const handleAttachmentSelection = (event: ChangeEvent<HTMLInputElement>, type: "image" | "file") => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setAttachmentPreview({ type, name: file.name, dataUrl: type === "image" ? (reader.result as string) : undefined })
    reader.readAsDataURL(file)
  }

  const handleSendMessage = async () => {
    if (!activeChat) return
    const trimmed = messageInput.trim()
    if (!trimmed && !attachmentPreview) return

    if (attachmentPreview) {
      const type = attachmentPreview.type === "image" ? "IMAGE" : "FILE"
      const result = await sendMessage({ conversationId: activeChat, type, content: attachmentPreview.name, attachmentUrl: attachmentPreview.dataUrl })
      if (result.success) { mutateMessages((prev) => [...(prev ?? []), result.message], { revalidate: false }); refreshConversations() }
      setAttachmentPreview(null)
      setMessageInput("")
      return
    }

    setMessageInput("")
    const result = await sendMessage({ conversationId: activeChat, type: "TEXT", content: trimmed })
    if (result.success) { mutateMessages((prev) => [...(prev ?? []), result.message], { revalidate: false }); refreshConversations() }
  }

  const handleClearChat = async () => {
    if (!activeChat) return
    await clearConversation({ conversationId: activeChat })
    mutateMessages([], { revalidate: false })
  }

  const playVoiceMessage = (attachmentUrl: string | null) => {
    if (!attachmentUrl) return
    new Audio(attachmentUrl).play().catch(() => {})
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${themeStyles.shell}`}>
      <div className="mx-auto flex h-screen max-w-6xl overflow-hidden shadow-xl lg:my-4 lg:h-[calc(100vh-2rem)] lg:rounded-2xl">
        <div className={`flex w-full flex-col border-r ${themeStyles.sidebar} ${themeStyles.border} ${activeChat ? 'hidden lg:flex lg:w-96' : 'flex lg:w-96'}`}>
          <div className="border-b border-border/70 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <MessageSquareText className="h-4 w-4" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-foreground">{t("nav.messages")}</h1>
                  <p className="text-xs text-muted-foreground">{t("provider.messages.subtitle")}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" title={t("provider.messages.newMessageTitle")} onClick={() => setShowNewChat(true)}>
                <SquarePen className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("provider.messages.chatSettings")}>
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{t("provider.messages.chatSettingsLabel")}</p>
                  <div className="space-y-2">
                    {chatThemeOptions.map((option) => (
                      <button key={option.id} onClick={() => setChatTheme(option.id)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${chatTheme === option.id ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}`}>
                        <div className="font-medium">{option.label}</div>
                        <div className="text-xs text-muted-foreground">{option.description}</div>
                      </button>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>

            <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900/30 dark:bg-emerald-900/20">
              <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" /> {t("provider.messages.fastResponseTitle")}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("provider.messages.fastResponseDesc")}</p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={t("provider.messages.searchPlaceholder")} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="rounded-full border-border bg-card pl-10" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">{t("provider.messages.noConversationsYet")}</div>
            )}
            {filteredConversations.map((conversation) => (
              <button key={conversation.id} onClick={() => setActiveChat(conversation.id)} className={`flex w-full gap-3 border-b border-border/60 p-4 text-left transition-colors last:border-b-0 hover:bg-muted/60 ${activeChat === conversation.id ? 'bg-emerald-50/70 dark:bg-emerald-900/20' : ''}`}>
                <div className="relative flex-shrink-0">
                  <Image src={conversation.avatar || '/placeholder.svg'} alt={conversation.name} width={48} height={48} className="h-12 w-12 rounded-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <h3 className="truncate font-semibold text-foreground">{conversation.name}</h3>
                    <span className="ml-2 whitespace-nowrap text-xs text-muted-foreground">{conversation.lastMessageAt ? formatRelativeTime(conversation.lastMessageAt) : ""}</span>
                  </div>
                  <p className="mb-1 truncate text-sm text-muted-foreground">{conversation.lastMessage}</p>
                  <div className="flex items-center justify-between">
                    <span className="truncate text-xs text-emerald-600">{conversation.role}</span>
                    {conversation.unreadCount > 0 && <span className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{conversation.unreadCount}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className={`flex flex-1 flex-col bg-gray-50 dark:bg-gray-900 ${activeChat ? 'flex' : 'hidden lg:flex'}`}>
          {activeChat && selectedChat ? (
            <>
              <div className={`flex items-center justify-between border-b ${themeStyles.border} p-4 ${themeStyles.header}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => setActiveChat(null)} aria-label={t("common.back")} className="rounded-lg p-2 hover:bg-muted lg:hidden"><ArrowLeft className="h-5 w-5" /></button>
                  <div className="relative flex-shrink-0">
                    <Image src={selectedChat.avatar || '/placeholder.svg'} alt={selectedChat.name} width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">{selectedChat.name}</h2>
                    <p className="text-xs text-muted-foreground">{selectedChat.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CallButton conversationId={activeChat} otherUserName={selectedChat?.name ?? "User"} otherUserAvatar={selectedChat?.avatar} autoStartToken={callAutoStart} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t("common.moreOptions")}><MoreVertical className="h-5 w-5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem><Info className="mr-2 h-4 w-4" />{t("provider.messages.jobInfo")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowAutoReplyPanel(!showAutoReplyPanel)}><Bot className="mr-2 h-4 w-4" />{t("provider.messages.autoReply")}</DropdownMenuItem>
                      <DropdownMenuItem onClick={handleClearChat}>{t("provider.messages.clearChat")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {autoReplyEnabled && (
                <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                  <Bot className="h-4 w-4 text-amber-600" />
                  <p className="flex-1 truncate text-xs text-amber-700 dark:text-amber-300">{t("provider.messages.autoReplyOnLabel", { mode: awayMode === 'off' ? t("provider.messages.customMode") : (awayPresets.find((preset) => preset.id === awayMode)?.label ?? "") })}</p>
                  <button onClick={() => { setAutoReplyEnabled(false); setAwayMode('off') }} className="text-xs font-medium text-amber-600 hover:underline">{t("provider.messages.turnOff")}</button>
                </div>
              )}

              {showAutoReplyPanel && (
                <div className="space-y-3 border-b border-border/70 bg-white p-4 dark:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-foreground">{t("provider.messages.autoReplyPanelTitle")}</h3>
                    </div>
                    <button onClick={() => setShowAutoReplyPanel(false)} aria-label={t("common.close")}><X className="h-4 w-4 text-muted-foreground" /></button>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
                    <span className="text-sm text-muted-foreground">{t("provider.messages.enableAutoReply")}</span>
                    <button onClick={() => setAutoReplyEnabled(!autoReplyEnabled)} className={`flex h-5 w-10 rounded-full transition-colors ${autoReplyEnabled ? 'justify-end bg-emerald-600' : 'justify-start bg-gray-300 dark:bg-gray-600'}`}><span className="mx-0.5 h-4 w-4 rounded-full bg-white" /></button>
                  </div>
                  <div className="flex gap-2">
                    {awayPresets.map((preset) => (
                      <button key={preset.id} onClick={() => { setAwayMode(preset.id); setAutoReplyMessage(preset.message); setAutoReplyEnabled(true) }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all ${awayMode === preset.id ? 'bg-emerald-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}><preset.icon className="h-3.5 w-3.5" />{preset.label}</button>
                    ))}
                  </div>
                  <textarea value={autoReplyMessage} onChange={(event) => setAutoReplyMessage(event.target.value)} rows={3} className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm text-foreground dark:bg-gray-700" placeholder={t("provider.messages.autoReplyMessagePlaceholder")} />
                  <div className="flex gap-2">
                    <Button onClick={() => { setAutoReplyEnabled(true); setShowAutoReplyPanel(false) }} size="sm" className="flex-1 rounded-lg">{t("provider.messages.saveActivate")}</Button>
                    <Button onClick={() => { setAutoReplyEnabled(false); setAwayMode('off'); setShowAutoReplyPanel(false) }} size="sm" variant="outline" className="rounded-lg">{t("provider.messages.disable")}</Button>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingMessages ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">{t("provider.messages.noMessagesYet")}</div>
                ) : messages.map((message) => (
                  <div key={message.id} className={`flex ${message.isMine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${message.isMine ? themeStyles.sentBubble : themeStyles.receivedBubble}`}>
                      {message.type === "TEXT" && <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>}
                      {message.type === "IMAGE" && <img src={message.attachmentUrl ?? undefined} alt={message.content || t("provider.messages.sharedAttachmentAlt")} className="mt-1 max-h-60 rounded-xl object-cover" />}
                      {message.type === "FILE" && <div className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm"><Paperclip className="h-4 w-4" />{message.content}</div>}
                      {message.type === "VOICE" && (
                        <div className="flex items-center gap-2.5 min-w-[160px]">
                          <button onClick={() => playVoiceMessage(message.attachmentUrl)} aria-label={t("provider.messages.playVoiceMessage")} className="w-9 h-9 rounded-full bg-black/10 flex items-center justify-center flex-shrink-0"><Play className="w-4 h-4" /></button>
                          <p className="text-xs opacity-80">{message.content}</p>
                        </div>
                      )}
                      {message.type === "LOCATION" && (
                        <div className="space-y-1.5"><div className="w-48 h-28 rounded-xl bg-emerald-600/20 flex items-center justify-center"><div className="text-center"><MapPin className="w-6 h-6 mx-auto mb-0.5" /><p className="text-xs font-medium">{t("provider.messages.locationSharedLabel")}</p></div></div><p className="text-[10px] opacity-70">{message.content}</p></div>
                      )}
                      <div className={`mt-1 flex items-center gap-1 text-[10px] opacity-80 ${message.isMine ? 'justify-end' : 'justify-start'}`}>
                        <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {message.isMine && (message.isRead ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                      </div>
                    </div>
                  </div>
                ))}
                {attachmentPreview && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl border border-dashed border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                      <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4" />{attachmentPreview.type === 'image' ? t("provider.messages.imageReadyToSend") : t("provider.messages.fileReadyToSend")}</div>
                      <p className="mt-1 text-xs">{attachmentPreview.name}</p>
                      <button onClick={() => setAttachmentPreview(null)} className="mt-2 text-xs underline">{t("provider.messages.removeButton")}</button>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className={`border-t ${themeStyles.border} p-4 ${themeStyles.composer}`}>
                <div className="flex items-end gap-2">
                  <button onClick={() => fileInputRef.current?.click()} aria-label={t("provider.messages.attachFile")} className="rounded-lg p-2 transition-colors hover:bg-muted"><Paperclip className="h-5 w-5 text-muted-foreground" /></button>
                  <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={(event) => handleAttachmentSelection(event, 'file')} />
                  <button onClick={() => imageInputRef.current?.click()} aria-label={t("provider.messages.attachImage")} className="rounded-lg p-2 transition-colors hover:bg-muted"><ImageIcon className="h-5 w-5 text-muted-foreground" /></button>
                  <input ref={imageInputRef} type="file" className="hidden" accept="image/*" onChange={(event) => handleAttachmentSelection(event, 'image')} />
                  <Input value={messageInput} onChange={(event) => setMessageInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && handleSendMessage()} placeholder={t("provider.messages.typeMessagePlaceholder")} className="flex-1 rounded-full border-border bg-card" />
                  <Button onClick={handleSendMessage} aria-label={t("provider.messages.sendMessage")} className="h-10 w-10 rounded-full bg-emerald-600 p-2 hover:bg-emerald-700"><Send className="h-5 w-5" /></Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">{t("provider.messages.selectConversationPrompt")}</div>
          )}
        </div>
      </div>

      <NewConversationModal
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        onConversationCreated={async (conversationId) => {
          await refreshConversations()
          setActiveChat(conversationId)
        }}
      />
    </div>
  )
}
