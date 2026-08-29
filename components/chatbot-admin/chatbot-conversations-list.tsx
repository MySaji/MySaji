"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bot, Loader2, Mail, MessageCircle, PhoneCall, CheckCircle2, User as UserIcon, Send, Headset } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuthContext } from "@/lib/auth-context"
import {
  getChatbotConversations, getChatbotConversationDetail, claimChatbotConversation,
  sendStaffChatMessage, closeChatbotConversation,
  type ChatbotConversationSummary, type ChatbotConversationDetail,
} from "@/lib/actions/chatbot-admin"

const STATUS_STYLE: Record<ChatbotConversationSummary["status"], { label: string; badge: string }> = {
  ACTIVE: { label: "Active", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  ESCALATED: { label: "Escalated", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  CLOSED: { label: "Closed", badge: "bg-muted text-muted-foreground" },
}

const POLL_INTERVAL_MS = 5000

// Shared across Admin, Sub-Admin, and Agent — same convention as
// components/shop-upgrades/shop-upgrade-requests-list.tsx: each portal's own
// layout supplies the brand chrome, this content area stays on neutral tokens.
export function ChatbotConversationsList() {
  const { user } = useAuthContext()
  const [isLoading, setIsLoading] = useState(true)
  const [conversations, setConversations] = useState<ChatbotConversationSummary[]>([])
  const [filter, setFilter] = useState<"all" | "escalated" | "active" | "closed">("escalated")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ChatbotConversationDetail>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [actionError, setActionError] = useState("")
  const [replyText, setReplyText] = useState("")
  const [isSendingReply, setIsSendingReply] = useState(false)
  const isSendingRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const refresh = () => getChatbotConversations().then(setConversations)

  useEffect(() => {
    refresh().finally(() => setIsLoading(false))
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const filtered = useMemo(() => {
    if (filter === "all") return conversations
    return conversations.filter((c) => c.status.toLowerCase() === filter)
  }, [conversations, filter])

  const unclaimedEscalatedCount = conversations.filter((c) => c.status === "ESCALATED" && !c.assignedStaffId).length

  const loadDetail = useCallback(async (id: string, { silent = false }: { silent?: boolean } = {}) => {
    if (!silent) setIsLoadingDetail(true)
    try {
      const data = await getChatbotConversationDetail(id)
      setDetail(data)
    } finally {
      if (!silent) setIsLoadingDetail(false)
    }
  }, [])

  const openDetail = async (id: string) => {
    setSelectedId(id)
    setActionError("")
    setReplyText("")
    await loadDetail(id)
  }

  // Poll the open conversation for new customer messages while the dialog
  // is up — this is a real two-way chat now, not a static transcript.
  useEffect(() => {
    if (!selectedId) return
    const interval = setInterval(() => {
      if (isSendingRef.current) return
      loadDetail(selectedId, { silent: true })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [selectedId, loadDetail])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [detail?.messages.length])

  const isMine = detail?.assignedStaffId === user?.id
  const isUnclaimed = !detail?.assignedStaffId
  const isClaimedByOther = !!detail?.assignedStaffId && !isMine

  const handleClaim = async () => {
    if (!selectedId) return
    setIsClaiming(true)
    setActionError("")
    try {
      const result = await claimChatbotConversation({ conversationId: selectedId })
      if (!result.success) { setActionError(result.error); return }
      await loadDetail(selectedId)
      await refresh()
    } catch {
      setActionError("Something went wrong accepting this conversation. Please try again.")
    } finally {
      setIsClaiming(false)
    }
  }

  const handleSendReply = async () => {
    if (!selectedId || !replyText.trim()) return
    const text = replyText.trim()
    setReplyText("")
    setActionError("")
    setIsSendingReply(true)
    isSendingRef.current = true
    try {
      const result = await sendStaffChatMessage({ conversationId: selectedId, message: text })
      if (!result.success) { setActionError(result.error); return }
      await loadDetail(selectedId, { silent: true })
      refresh()
    } catch {
      setActionError("Something went wrong sending your message. Please try again.")
    } finally {
      setIsSendingReply(false)
      isSendingRef.current = false
    }
  }

  const handleClose = async () => {
    if (!selectedId) return
    setIsClosing(true)
    setActionError("")
    try {
      const result = await closeChatbotConversation({ conversationId: selectedId })
      if (!result.success) { setActionError(result.error); return }
      setSelectedId(null)
      setDetail(null)
      await refresh()
    } catch {
      setActionError("Something went wrong closing this conversation. Please try again.")
    } finally {
      setIsClosing(false)
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Bot className="w-7 h-7" /> Chatbot Conversations
        </h1>
        <p className="text-muted-foreground mt-1">SAJI Assistant chats across Customer, Provider, and Shopkeeper. Accept an escalation to chat with the customer yourself.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { id: "escalated" as const, label: "Escalated", count: unclaimedEscalatedCount },
          { id: "active" as const, label: "Active", count: conversations.filter((c) => c.status === "ACTIVE").length },
          { id: "closed" as const, label: "Closed", count: conversations.filter((c) => c.status === "CLOSED").length },
          { id: "all" as const, label: "All", count: conversations.length },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 whitespace-nowrap rounded-lg font-medium transition-colors flex items-center gap-2 text-sm ${
              filter === f.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-black/10 dark:bg-white/10">{f.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="border-0 shadow-sm p-12 text-center">
          <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold text-foreground mb-1">No conversations here</p>
          <p className="text-sm text-muted-foreground">{filter === "escalated" ? "No one is waiting on a human reply right now." : "Nothing to show for this filter."}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Card key={c.id} onClick={() => openDetail(c.id)} className="p-4 border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground truncate">{c.userName}</p>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded-full px-1.5 py-0.5 flex-shrink-0">{c.userRole}</span>
                    {c.assignedStaffName && (
                      <span className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5 flex-shrink-0">
                        <Headset className="w-3 h-3" /> {c.assignedStaffId === user?.id ? "You" : c.assignedStaffName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" /> {c.userEmail}</p>
                  <p className="text-xs text-muted-foreground truncate mt-1">{c.lastMessagePreview}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_STYLE[c.status].badge}`}>{STATUS_STYLE[c.status].label}</span>
                  <span className="text-[11px] text-muted-foreground">{new Date(c.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedId} onOpenChange={(open) => { if (!open) { setSelectedId(null); setDetail(null) } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Bot className="w-4 h-4" /> Conversation</DialogTitle>
          </DialogHeader>
          {isLoadingDetail ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : detail ? (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <p className="font-semibold text-foreground">{detail.userName}</p>
                <p className="text-muted-foreground text-xs">{detail.userEmail}</p>
              </div>

              <div className="max-h-[45vh] overflow-y-auto space-y-2 pr-1">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "USER" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      m.role === "USER" ? "bg-primary text-primary-foreground" : m.role === "STAFF" ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-foreground" : "bg-muted text-foreground"
                    }`}>
                      <p className="flex items-center gap-1 text-[10px] opacity-70 mb-0.5">
                        {m.role === "USER" ? <UserIcon className="w-3 h-3" /> : m.role === "STAFF" ? <Headset className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                        {m.role === "USER" ? detail.userName : m.role === "STAFF" ? (m.senderName ?? "Support") : "SAJI Assistant"}
                      </p>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {detail.status === "ESCALATED" && isClaimedByOther && (
                <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5">
                  <PhoneCall className="w-3.5 h-3.5 flex-shrink-0" /> {detail.assignedStaffName} already accepted this conversation.
                </div>
              )}

              {actionError && <p className="text-sm text-red-600">{actionError}</p>}

              {detail.status === "ESCALATED" && isUnclaimed && (
                <Button onClick={handleClaim} disabled={isClaiming} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Headset className="w-4 h-4 mr-1.5" /> Accept &amp; Start Chatting</>}
                </Button>
              )}

              {detail.status === "ESCALATED" && isMine && (
                <div className="flex gap-2">
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                    placeholder="Reply to the customer..."
                    disabled={isSendingReply}
                    className="flex-1"
                  />
                  <Button onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply} size="icon" className="flex-shrink-0">
                    {isSendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              )}

              {detail.status !== "CLOSED" && (detail.status !== "ESCALATED" || isMine) && (
                <Button onClick={handleClose} disabled={isClosing} variant="outline" className="w-full">
                  {isClosing ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark Resolved</>}
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">Conversation not found.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
