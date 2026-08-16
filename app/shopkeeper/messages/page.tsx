"use client"

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import {
  Search, MoreVertical, Send, Paperclip, ImageIcon, ArrowLeft,
  Check, CheckCheck, Settings2, Loader2, Play, MapPin, SquarePen
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
  getConversations, sendMessage,
  getChatTheme, updateChatTheme, clearConversation,
  type ConversationSummary,
} from "@/lib/actions/messages"
import { useConversationMessages } from "@/lib/hooks/useConversationMessages"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

type ChatTheme = "classic" | "aurora" | "midnight" | "sunset"
const THEME_TO_DB: Record<ChatTheme, string> = { classic: "CLASSIC", aurora: "AURORA", midnight: "MIDNIGHT", sunset: "SUNSET" }
const THEME_FROM_DB: Record<string, ChatTheme> = { CLASSIC: "classic", AURORA: "aurora", MIDNIGHT: "midnight", SUNSET: "sunset" }

export default function ShopkeeperMessagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <ShopkeeperMessagesContent />
    </Suspense>
  )
}

function ShopkeeperMessagesContent() {
  const { t } = useLocalization()
  const searchParams = useSearchParams()
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [messageInput, setMessageInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [chatTheme, setChatTheme] = useState<ChatTheme>("classic")
  const [attachmentPreview, setAttachmentPreview] = useState<{ type: "image" | "file"; name: string; dataUrl?: string } | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatThemeOptions: { id: ChatTheme; label: string; description: string }[] = [
    { id: "classic", label: t("shopkeeper.messages.themeClassicLabel"), description: t("shopkeeper.messages.themeClassicDesc") },
    { id: "aurora", label: t("shopkeeper.messages.themeAuroraLabel"), description: t("shopkeeper.messages.themeAuroraDesc") },
    { id: "midnight", label: t("shopkeeper.messages.themeMidnightLabel"), description: t("shopkeeper.messages.themeMidnightDesc") },
    { id: "sunset", label: t("shopkeeper.messages.themeSunsetLabel"), description: t("shopkeeper.messages.themeSunsetDesc") },
  ]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { messages, mutateMessages, isLoadingMessages } = useConversationMessages(activeChat)

  const refreshConversations = useCallback(() => getConversations().then(setConversations), [])

  useEffect(() => {
    getChatTheme().then((dbTheme) => setChatTheme(THEME_FROM_DB[dbTheme] ?? "classic"))
    refreshConversations().finally(() => setIsLoading(false))
  }, [refreshConversations])

  useEffect(() => {
    const conversationParam = searchParams.get("conversation")
    if (conversationParam) setActiveChat(conversationParam)
  }, [searchParams])

  useEffect(() => {
    updateChatTheme({ theme: THEME_TO_DB[chatTheme] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTheme])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const selectedChat = conversations.find(c => c.id === activeChat)

  const filteredConversations = conversations.filter(conv =>
    conv.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const themeStyles = {
    classic: {
      shell: "bg-gray-50 dark:bg-gray-900",
      sidebar: "bg-white dark:bg-gray-800",
      header: "bg-white dark:bg-gray-800",
      composer: "bg-white dark:bg-gray-800",
      sentBubble: "bg-amber-600 text-white rounded-br-none",
      receivedBubble: "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none",
      accent: "bg-amber-600",
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
      <div className="max-w-6xl mx-auto flex h-screen lg:h-[calc(100vh-2rem)] lg:my-4 lg:rounded-2xl overflow-hidden shadow-xl">
        {/* Conversations List */}
        <div className={`w-full lg:w-96 ${themeStyles.sidebar} border-r ${themeStyles.border} flex flex-col ${activeChat ? 'hidden lg:flex' : 'flex'}`}>
          {/* Header */}
          <div className="p-4 border-b dark:border-gray-700">
            <div className="mb-4 flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("shopkeeper.messages.headerTitle")}</h1>
              <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" title={t("shopkeeper.messages.newMessageTooltip")} onClick={() => setShowNewChat(true)}>
                <SquarePen className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{t("shopkeeper.messages.chatSettingsLabel")}</p>
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
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("shopkeeper.messages.searchConversationsPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Conversations */}
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">{t("shopkeeper.messages.noConversationsYet")}</div>
            )}
            {filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveChat(conv.id)}
                className={`w-full p-4 flex gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left border-b dark:border-gray-700 last:border-0 ${
                  activeChat === conv.id ? "bg-amber-50 dark:bg-amber-900/20" : ""
                }`}
              >
                <div className="relative flex-shrink-0">
                  <Image
                    src={conv.avatar || "/placeholder.svg"}
                    alt={conv.name}
                    width={48}
                    height={48}
                    className="rounded-full object-cover w-12 h-12"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">{conv.name}</h3>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ""}</span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mb-1">{conv.lastMessage}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-600 dark:text-amber-400 truncate">{conv.role}</span>
                    {conv.unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 ml-2">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 ${activeChat ? 'flex' : 'hidden lg:flex'}`}>
          {activeChat && selectedChat ? (
            <>
              {/* Chat Header */}
              <div className={`p-4 ${themeStyles.header} border-b ${themeStyles.border} flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveChat(null)}
                    aria-label={t("shopkeeper.messages.backToConversationsLabel")}
                    className="lg:hidden p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="relative flex-shrink-0">
                    <Image
                      src={selectedChat.avatar || "/placeholder.svg"}
                      alt={selectedChat.name}
                      width={44}
                      height={44}
                      className="rounded-full object-cover w-11 h-11"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-gray-900 dark:text-white">{selectedChat.name}</h2>
                    <p className="text-xs text-muted-foreground">{selectedChat.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CallButton conversationId={activeChat} otherUserName={selectedChat.name} otherUserAvatar={selectedChat.avatar} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost">
                        <MoreVertical className="w-5 h-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleClearChat}>{t("shopkeeper.messages.clearChat")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {isLoadingMessages ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">{t("shopkeeper.messages.noMessagesYet")}</div>
                ) : messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.isMine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-xs px-4 py-2 rounded-2xl ${
                      msg.isMine
                        ? themeStyles.sentBubble
                        : themeStyles.receivedBubble
                    }`}>
                      {msg.type === "TEXT" && <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>}
                      {msg.type === "IMAGE" && <img src={msg.attachmentUrl ?? undefined} alt={msg.content || "Shared attachment"} className="mt-1 max-h-60 rounded-xl object-cover" />}
                      {msg.type === "FILE" && <div className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-sm"><Paperclip className="h-4 w-4" />{msg.content}</div>}
                      {msg.type === "VOICE" && (
                        <div className="flex items-center gap-2.5 min-w-[160px]">
                          <button onClick={() => playVoiceMessage(msg.attachmentUrl)} aria-label={t("shopkeeper.messages.playVoiceMessage")} className="w-9 h-9 rounded-full bg-black/10 flex items-center justify-center flex-shrink-0"><Play className="w-4 h-4" /></button>
                          <p className="text-xs opacity-80">{msg.content}</p>
                        </div>
                      )}
                      {msg.type === "LOCATION" && (
                        <div className="space-y-1.5">
                          <div className="w-48 h-28 rounded-xl bg-amber-600/20 flex items-center justify-center">
                            <div className="text-center"><MapPin className="w-6 h-6 mx-auto mb-0.5" /><p className="text-xs font-medium">{t("shopkeeper.messages.locationSharedLabel")}</p></div>
                          </div>
                          <p className="text-[10px] opacity-70">{msg.content}</p>
                        </div>
                      )}
                      <div className={`flex items-center gap-1 mt-1 ${msg.isMine ? "justify-end" : "justify-start"}`}>
                        <span className="text-[10px] opacity-70">{new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {msg.isMine && (
                          msg.isRead ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {attachmentPreview && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                      <p className="font-medium">{attachmentPreview.type === "image" ? t("shopkeeper.messages.imageReadyToSend") : t("shopkeeper.messages.fileReadyToSend")}</p>
                      <p className="mt-1 text-xs">{attachmentPreview.name}</p>
                      <button onClick={() => setAttachmentPreview(null)} className="mt-2 text-xs underline">{t("shopkeeper.messages.removeButton")}</button>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className={`p-4 ${themeStyles.composer} border-t ${themeStyles.border}`}>
                <div className="flex items-end gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    aria-label={t("shopkeeper.messages.attachFileLabel")}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <Paperclip className="w-5 h-5 text-muted-foreground" />
                  </button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"
                    onChange={(e) => handleAttachmentSelection(e, "file")}
                  />
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    aria-label={t("shopkeeper.messages.attachImageLabel")}
                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <ImageIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                  <input
                    type="file"
                    ref={imageInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleAttachmentSelection(e, "image")}
                  />
                  <Input
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder={t("shopkeeper.messages.typeMessagePlaceholder")}
                    className="flex-1 rounded-full"
                  />
                  <Button
                    onClick={handleSendMessage}
                    aria-label={t("shopkeeper.messages.sendButtonLabel")}
                    className="bg-amber-600 hover:bg-amber-700 rounded-full p-2 w-10 h-10"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p>{t("shopkeeper.messages.selectConversationHint")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Call Dialog */}
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
