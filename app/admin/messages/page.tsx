"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Send, Paperclip, Trash2, Search, Settings2, Loader2, SquarePen } from "lucide-react"
import { NewConversationModal } from "@/components/messages/new-conversation-modal"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
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

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <MessagesPageContent />
    </Suspense>
  )
}

function MessagesPageContent() {
  const { t } = useLocalization()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [chatTheme, setChatTheme] = useState<ChatTheme>("classic")
  const [showNewChat, setShowNewChat] = useState(false)
  const { messages, mutateMessages } = useConversationMessages(selectedConversation)

  const chatThemeOptions: { id: ChatTheme; label: string; description: string }[] = [
    { id: "classic", label: t("admin.messages.themeClassic"), description: t("admin.messages.themeClassicDesc") },
    { id: "aurora", label: t("admin.messages.themeAurora"), description: t("admin.messages.themeAuroraDesc") },
    { id: "midnight", label: t("admin.messages.themeMidnight"), description: t("admin.messages.themeMidnightDesc") },
    { id: "sunset", label: t("admin.messages.themeSunset"), description: t("admin.messages.themeSunsetDesc") },
  ]

  const refreshConversations = useCallback(() => getConversations().then(setConversations), [])

  useEffect(() => {
    getChatTheme().then((dbTheme) => setChatTheme(THEME_FROM_DB[dbTheme] ?? "classic"))
    refreshConversations().finally(() => setIsLoading(false))
  }, [refreshConversations])

  // Deep-link from a "New message" notification (?conversation=<id>) — without
  // this, clicking the notification landed on the bare inbox with nothing
  // selected, which read exactly like the message wasn't there at all.
  useEffect(() => {
    const conversationParam = searchParams.get("conversation")
    if (conversationParam) {
      setSelectedConversation(conversationParam)
      setShowMobileChat(true)
    }
  }, [searchParams])

  useEffect(() => {
    updateChatTheme({ theme: THEME_TO_DB[chatTheme] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTheme])

  const themeStyles = {
    classic: {
      shell: "bg-transparent",
      panel: "bg-white dark:bg-gray-800",
      header: "bg-gradient-to-r from-blue-50 to-blue-100 dark:from-gray-800 dark:to-gray-800",
      inputPanel: "bg-gray-50 dark:bg-gray-800",
      input: "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700",
      sentBubble: "bg-blue-600 text-white rounded-br-none",
      receivedBubble: "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-none",
      border: "border-gray-200 dark:border-gray-700",
    },
    aurora: {
      shell: "bg-[radial-gradient(circle_at_top_left,_rgba(129,140,248,0.14),_transparent_32%),linear-gradient(135deg,_rgba(248,250,252,1),_rgba(224,231,255,1))] dark:bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_transparent_36%),linear-gradient(135deg,_rgba(2,6,23,1),_rgba(15,23,42,1))]",
      panel: "bg-white/80 dark:bg-slate-900/70 backdrop-blur",
      header: "bg-gradient-to-r from-violet-600/10 to-sky-600/10 dark:from-slate-900/80 dark:to-slate-900/80",
      inputPanel: "bg-white/70 dark:bg-slate-900/70 backdrop-blur",
      input: "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800",
      sentBubble: "bg-gradient-to-r from-violet-600 to-sky-600 text-white rounded-br-none",
      receivedBubble: "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-none",
      border: "border-slate-200 dark:border-slate-700",
    },
    midnight: {
      shell: "bg-[linear-gradient(135deg,_rgba(15,23,42,1),_rgba(30,41,59,1))]",
      panel: "bg-slate-900/90 text-slate-100 border-slate-800",
      header: "bg-slate-900/90",
      inputPanel: "bg-slate-900/90",
      input: "border-slate-700 bg-slate-800 text-slate-100",
      sentBubble: "bg-cyan-600 text-white rounded-br-none",
      receivedBubble: "bg-slate-800 text-slate-100 rounded-bl-none",
      border: "border-slate-800",
    },
    sunset: {
      shell: "bg-[linear-gradient(135deg,_rgba(255,247,237,1),_rgba(254,215,170,1))] dark:bg-[linear-gradient(135deg,_rgba(69,26,3,1),_rgba(120,53,15,1))]",
      panel: "bg-white/90 dark:bg-amber-950/80 backdrop-blur",
      header: "bg-gradient-to-r from-orange-500/10 to-rose-500/10 dark:from-amber-950/70 dark:to-amber-950/70",
      inputPanel: "bg-white/70 dark:bg-amber-950/70 backdrop-blur",
      input: "border-orange-200 dark:border-amber-800 bg-white dark:bg-amber-900/80",
      sentBubble: "bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-br-none",
      receivedBubble: "bg-orange-50 dark:bg-amber-900/50 text-orange-950 dark:text-orange-100 rounded-bl-none",
      border: "border-orange-200 dark:border-amber-800",
    },
  }[chatTheme]

  const selectedConversationData = conversations.find(c => c.id === selectedConversation)

  const filteredConversations = conversations.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.lastMessage.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConversation) return
    const trimmed = replyText.trim()
    setReplyText("")
    const result = await sendMessage({ conversationId: selectedConversation, type: "TEXT", content: trimmed })
    if (result.success) { mutateMessages((prev) => [...(prev ?? []), result.message], { revalidate: false }); refreshConversations() }
  }

  const handleDeleteChat = async (conversationId: string) => {
    await clearConversation({ conversationId })
    mutateMessages([], { revalidate: false })
    if (selectedConversation === conversationId) {
      setSelectedConversation(null)
      setShowMobileChat(false)
    }
  }

  const roleBadgeColor = (role: string) => {
    switch (role) {
      case "Customer": return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
      case "Provider": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
      case "Shopkeeper": return "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
      default: return "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className={`space-y-6 pb-20 lg:pb-0 ${themeStyles.shell}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">{t("admin.messages.title")}</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">{t("admin.messages.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="shrink-0" title={t("admin.messages.newMessageTitle")} onClick={() => setShowNewChat(true)}>
          <SquarePen className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0">
              <Settings2 className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{t("admin.messages.chatSettings")}</p>
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

      <div className={`${showMobileChat ? 'hidden' : 'block'} lg:block`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-[600px]">
          <Card className={`lg:col-span-1 border-0 shadow-lg p-0 overflow-hidden flex flex-col ${themeStyles.panel}`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder={t("admin.messages.searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">{t("admin.messages.noConversationsYet")}</div>
              )}
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    setSelectedConversation(conv.id)
                    setShowMobileChat(true)
                  }}
                  className={`w-full text-left p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    selectedConversation === conv.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  } ${conv.unreadCount > 0 ? "bg-yellow-50 dark:bg-yellow-900/10" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <Image src={conv.avatar || "/placeholder.svg"} alt={conv.name} width={36} height={36} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{conv.name}</h3>
                        <span className="text-xs text-gray-500 whitespace-nowrap ml-2">{conv.lastMessageAt ? formatRelativeTime(conv.lastMessageAt) : ""}</span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{conv.lastMessage}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${roleBadgeColor(conv.role)}`}>{conv.role}</span>
                        {conv.unreadCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500 text-white font-semibold">{conv.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card className={`lg:col-span-2 border-0 shadow-lg p-0 overflow-hidden flex flex-col ${themeStyles.panel}`}>
            {selectedConversationData ? (
              <>
                <div className={`p-6 border-b ${themeStyles.border} ${themeStyles.header}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <button
                        onClick={() => setShowMobileChat(false)}
                        className="lg:hidden p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400 flex-shrink-0"
                      >
                        ←
                      </button>
                      <Image src={selectedConversationData.avatar || "/placeholder.svg"} alt={selectedConversationData.name} width={40} height={40} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{selectedConversationData.name}</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{selectedConversationData.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleDeleteChat(selectedConversation!)}
                        className="p-2 hover:bg-red-200 dark:hover:bg-red-900/30 rounded-lg transition-colors text-red-600 dark:text-red-400"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`flex-1 overflow-y-auto p-6 space-y-4 ${themeStyles.shell}`}>
                  {messages.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">{t("admin.messages.noMessagesYet")}</div>
                  ) : messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.isMine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${msg.isMine ? themeStyles.sentBubble : themeStyles.receivedBubble}`}>
                        {msg.type === "TEXT" && <p className="text-sm">{msg.content}</p>}
                        {msg.type === "IMAGE" && <img src={msg.attachmentUrl ?? undefined} alt={msg.content || "Attachment"} className="max-h-60 rounded-lg object-cover" />}
                        {msg.type === "FILE" && <div className="flex items-center gap-2 text-sm"><Paperclip className="h-4 w-4" />{msg.content}</div>}
                        <p className={`text-xs mt-2 ${msg.isMine ? "text-blue-200" : "text-gray-500"}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className={`p-4 border-t ${themeStyles.border} ${themeStyles.inputPanel}`}>
                  <div className="flex gap-2 items-end">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.ctrlKey) handleSendReply()
                      }}
                      placeholder={t("admin.messages.replyPlaceholderCtrl")}
                      rows={3}
                      className={`flex-1 px-4 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${themeStyles.input}`}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={!replyText.trim()}
                      className="p-2 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white rounded-lg transition-colors flex-shrink-0"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 dark:text-gray-400">{t("admin.messages.selectConversationHint")}</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {showMobileChat && selectedConversationData && (
        <Card className={`fixed inset-0 lg:hidden border-0 shadow-lg p-0 overflow-hidden flex flex-col rounded-none z-50 ${themeStyles.panel}`}>
          <div className={`p-4 border-b ${themeStyles.border} ${themeStyles.header} flex items-center justify-between`}>
            <button
              onClick={() => setShowMobileChat(false)}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
            >
              ←
            </button>
            <div className="flex-1 px-2">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{selectedConversationData.name}</h2>
            </div>
            <button
              onClick={() => handleDeleteChat(selectedConversation!)}
              className="p-2 hover:bg-red-200 dark:hover:bg-red-900/30 rounded-lg transition-colors text-red-600 dark:text-red-400"
            >
              <Trash2 size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs px-4 py-3 rounded-lg ${
                  msg.isMine
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-none"
                }`}>
                  {msg.type === "TEXT" && <p className="text-sm">{msg.content}</p>}
                  <p className={`text-xs mt-2 ${msg.isMine ? "text-blue-200" : "text-gray-500"}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex gap-2 items-end">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.ctrlKey) handleSendReply()
                }}
                placeholder={t("admin.messages.replyPlaceholder")}
                rows={2}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
              />
              <button
                onClick={handleSendReply}
                disabled={!replyText.trim()}
                className="p-2 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white rounded-lg transition-colors flex-shrink-0"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </Card>
      )}

      <NewConversationModal
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        onConversationCreated={async (conversationId) => {
          await refreshConversations()
          setSelectedConversation(conversationId)
          setShowMobileChat(true)
        }}
        showRoleFilter
      />
    </div>
  )
}
