"use client"

import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from "react"
import { useSearchParams } from "next/navigation"
import { Search, Send, ArrowLeft, Loader2, Settings2, Paperclip, ImageIcon, Check, CheckCheck, SquarePen } from "lucide-react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  getConversations, sendMessage,
  getChatTheme, updateChatTheme,
  type ConversationSummary,
} from "@/lib/actions/messages"
import { NewConversationModal } from "@/components/messages/new-conversation-modal"
import { useConversationMessages } from "@/lib/hooks/useConversationMessages"
import { formatRelativeTime } from "@/lib/format"
import { useLocalization } from "@/lib/hooks/useLocalization"

type ChatTheme = "classic" | "aurora" | "midnight" | "sunset"
const THEME_TO_DB: Record<ChatTheme, string> = { classic: "CLASSIC", aurora: "AURORA", midnight: "MIDNIGHT", sunset: "SUNSET" }
const THEME_FROM_DB: Record<string, ChatTheme> = { CLASSIC: "classic", AURORA: "aurora", MIDNIGHT: "midnight", SUNSET: "sunset" }

export default function SubAdminMessagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SubAdminMessagesPageContent />
    </Suspense>
  )
}

function SubAdminMessagesPageContent() {
  const { t } = useLocalization()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(true)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeChat, setActiveChat] = useState<string | null>(null)
  const [msg, setMsg] = useState("")
  const [search, setSearch] = useState("")
  const [chatTheme, setChatTheme] = useState<ChatTheme>("classic")
  const [showNewChat, setShowNewChat] = useState(false)
  const [attachmentPreview, setAttachmentPreview] = useState<{ type: "image" | "file"; name: string; dataUrl?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const { messages, mutateMessages, isLoadingMessages } = useConversationMessages(activeChat)

  const chatThemeOptions: { id: ChatTheme; label: string; description: string }[] = [
    { id: "classic", label: t("subAdmin.messages.themeClassicLabel"), description: t("subAdmin.messages.themeClassicDesc") },
    { id: "aurora", label: t("subAdmin.messages.themeAuroraLabel"), description: t("subAdmin.messages.themeAuroraDesc") },
    { id: "midnight", label: t("subAdmin.messages.themeMidnightLabel"), description: t("subAdmin.messages.themeMidnightDesc") },
    { id: "sunset", label: t("subAdmin.messages.themeSunsetLabel"), description: t("subAdmin.messages.themeSunsetDesc") },
  ]

  const refreshConversations = useCallback(() => getConversations().then(setConversations), [])

  useEffect(() => {
    getChatTheme().then((dbTheme) => setChatTheme(THEME_FROM_DB[dbTheme] ?? "classic"))
    refreshConversations().finally(() => setIsLoading(false))
  }, [refreshConversations])

  // Deep-link from a "New message" notification (?conversation=<id>).
  useEffect(() => {
    const conversationParam = searchParams.get("conversation")
    if (conversationParam) setActiveChat(conversationParam)
  }, [searchParams])

  useEffect(() => {
    updateChatTheme({ theme: THEME_TO_DB[chatTheme] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatTheme])

  const active = conversations.find(c => c.id === activeChat)
  const filtered = conversations.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  const themeStyles = {
    classic: { sentBubble: "bg-blue-600 text-white rounded-br-sm", receivedBubble: "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm", accent: "bg-blue-600 hover:bg-blue-700", activeRow: "bg-blue-50 dark:bg-blue-900/20" },
    aurora: { sentBubble: "bg-gradient-to-r from-violet-600 to-sky-600 text-white rounded-br-sm", receivedBubble: "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-bl-sm", accent: "bg-gradient-to-r from-violet-600 to-sky-600 hover:opacity-90", activeRow: "bg-violet-50 dark:bg-violet-900/20" },
    midnight: { sentBubble: "bg-cyan-600 text-white rounded-br-sm", receivedBubble: "bg-slate-800 text-slate-100 rounded-bl-sm", accent: "bg-cyan-600 hover:bg-cyan-700", activeRow: "bg-slate-800" },
    sunset: { sentBubble: "bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-br-sm", receivedBubble: "bg-orange-50 dark:bg-amber-900/50 text-orange-950 dark:text-orange-100 rounded-bl-sm", accent: "bg-gradient-to-r from-orange-500 to-rose-500 hover:opacity-90", activeRow: "bg-orange-50 dark:bg-amber-900/20" },
  }[chatTheme]

  const handleAttachmentSelection = (event: ChangeEvent<HTMLInputElement>, type: "image" | "file") => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setAttachmentPreview({ type, name: file.name, dataUrl: type === "image" ? (reader.result as string) : undefined })
    reader.readAsDataURL(file)
  }

  const handleSend = async () => {
    if (!activeChat) return
    const trimmed = msg.trim()
    if (!trimmed && !attachmentPreview) return

    if (attachmentPreview) {
      const type = attachmentPreview.type === "image" ? "IMAGE" : "FILE"
      const result = await sendMessage({ conversationId: activeChat, type, content: attachmentPreview.name, attachmentUrl: attachmentPreview.dataUrl })
      if (result.success) { mutateMessages((prev) => [...(prev ?? []), result.message], { revalidate: false }); refreshConversations() }
      setAttachmentPreview(null)
      setMsg("")
      return
    }

    setMsg("")
    const result = await sendMessage({ conversationId: activeChat, type: "TEXT", content: trimmed })
    if (result.success) { mutateMessages((prev) => [...(prev ?? []), result.message], { revalidate: false }); refreshConversations() }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-140px)] lg:h-[calc(100vh-100px)] bg-white dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
      <div className={`${activeChat ? "hidden sm:flex" : "flex"} flex-col w-full sm:w-80 border-r border-gray-200 dark:border-gray-700`}>
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-gray-900 dark:text-white">{t("subAdmin.messages.headerTitle")}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" title={t("subAdmin.messages.newMessageTooltip")} onClick={() => setShowNewChat(true)}>
                <SquarePen className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">{t("subAdmin.messages.chatSettingsLabel")}</p>
                  <div className="space-y-2">
                    {chatThemeOptions.map((option) => (
                      <button key={option.id} onClick={() => setChatTheme(option.id)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${chatTheme === option.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("subAdmin.messages.searchPlaceholder")} className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm outline-none text-gray-700 dark:text-gray-200" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">{t("subAdmin.messages.noConversations")}</div>
          )}
          {filtered.map(c => (
            <button key={c.id} onClick={()=>setActiveChat(c.id)} className={`w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${activeChat===c.id?themeStyles.activeRow:""}`}>
              <Image src={c.avatar || "/placeholder.svg"} alt={c.name} width={36} height={36} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{c.lastMessageAt ? formatRelativeTime(c.lastMessageAt) : ""}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{c.lastMessage}</p>
                <span className="text-[10px] text-blue-600 dark:text-blue-400">{c.role}</span>
              </div>
              {c.unreadCount > 0 && <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold flex-shrink-0">{c.unreadCount}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={`${activeChat ? "flex" : "hidden sm:flex"} flex-col flex-1`}>
        {active ? (
          <>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <button onClick={()=>setActiveChat(null)} className="sm:hidden text-gray-600 dark:text-gray-300"><ArrowLeft size={20} /></button>
              <Image src={active.avatar || "/placeholder.svg"} alt={active.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
              <div className="flex-1"><p className="text-sm font-semibold text-gray-900 dark:text-white">{active.name}</p><p className="text-[10px] text-gray-500">{active.role}</p></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoadingMessages ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center text-sm text-gray-400 py-8">{t("subAdmin.messages.noMessagesYet")}</div>
              ) : messages.map((m) => (
                <div key={m.id} className={`flex ${m.isMine ?"justify-end":"justify-start"}`}>
                  <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${m.isMine?themeStyles.sentBubble:themeStyles.receivedBubble}`}>
                    {m.type === "TEXT" && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    {m.type === "IMAGE" && <img src={m.attachmentUrl ?? undefined} alt={m.content || t("subAdmin.messages.sharedAttachmentAlt")} className="mt-1 max-h-60 rounded-lg object-cover" />}
                    {m.type === "FILE" && <div className="flex items-center gap-2"><Paperclip className="h-4 w-4" />{m.content}</div>}
                    <div className={`flex items-center gap-1 mt-1 ${m.isMine ? "justify-end" : "justify-start"}`}>
                      <span className={`text-[9px] ${m.isMine?"text-blue-200":"text-gray-400"}`}>{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {m.isMine && (m.isRead ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />)}
                    </div>
                  </div>
                </div>
              ))}
              {attachmentPreview && (
                <div className="flex justify-end">
                  <div className="max-w-[75%] rounded-xl border border-dashed border-blue-400 bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                    <p className="font-medium">{attachmentPreview.type === "image" ? t("subAdmin.messages.imageReadyToSend") : t("subAdmin.messages.fileReadyToSend")}</p>
                    <p className="mt-1 text-xs">{attachmentPreview.name}</p>
                    <button onClick={() => setAttachmentPreview(null)} className="mt-2 text-xs underline">{t("subAdmin.messages.removeButton")}</button>
                  </div>
                </div>
              )}
            </div>
            <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><Paperclip className="w-4 h-4 text-gray-500" /></button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip" onChange={(e) => handleAttachmentSelection(e, "file")} />
              <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"><ImageIcon className="w-4 h-4 text-gray-500" /></button>
              <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={(e) => handleAttachmentSelection(e, "image")} />
              <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSend()} placeholder={t("subAdmin.messages.messagePlaceholder")} className="flex-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm outline-none text-gray-900 dark:text-white" />
              <button onClick={handleSend} className={`p-2 rounded-lg text-white transition-colors ${themeStyles.accent}`}><Send size={16} /></button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-6">
            <div><p className="text-gray-400 text-sm">{t("subAdmin.messages.selectConversationPrompt")}</p></div>
          </div>
        )}
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
