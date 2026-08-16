"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Send, X, AlertCircle, Loader2, Sparkles, PhoneCall, MessageSquare, Headset } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuthContext } from "@/lib/auth-context"
import {
  getMyChatbotConversation, sendChatbotMessage, escalateChatbotConversation,
  type ChatbotMessageItem,
} from "@/lib/actions/chatbot"

const POLL_INTERVAL_MS = 5000

/** The chat UI itself — deliberately has no opinion on its own size or
 * position (no `fixed`/`inset-0` here). The caller decides that: a
 * full-screen overlay on mobile, a phone-sized floating panel on desktop
 * (see components/floating-chat-button.tsx), or a full page (app/chatbot/
 * page.tsx, kept as a direct-link fallback). This component just fills
 * whatever box it's given. */
export function ChatbotWidget({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { user } = useAuthContext()

  const [isLoading, setIsLoading] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [status, setStatus] = useState<"ACTIVE" | "ESCALATED" | "CLOSED">("ACTIVE")
  const [assignedStaffName, setAssignedStaffName] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatbotMessageItem[]>([])
  const [inputValue, setInputValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState("")
  const [isEscalating, setIsEscalating] = useState(false)
  const [escalateError, setEscalateError] = useState("")
  const [aiUnconfigured, setAiUnconfigured] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isSendingRef = useRef(false)

  const applyConversation = useCallback((data: NonNullable<Awaited<ReturnType<typeof getMyChatbotConversation>>>) => {
    setConversationId(data.id)
    setStatus(data.status)
    setAssignedStaffName(data.assignedStaffName)
    setMessages(data.messages)
  }, [])

  useEffect(() => {
    getMyChatbotConversation()
      .then((data) => { if (data) applyConversation(data) })
      .finally(() => setIsLoading(false))
  }, [applyConversation])

  // Polls for staff replies arriving while this tab stays open — only
  // matters once escalated, a human might reply minutes later.
  useEffect(() => {
    if (status !== "ESCALATED") return
    const interval = setInterval(() => {
      if (isSendingRef.current) return
      getMyChatbotConversation().then((data) => { if (data) applyConversation(data) })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [status, applyConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return
    const text = inputValue.trim()
    setInputValue("")
    setSendError("")
    setIsSending(true)
    isSendingRef.current = true

    try {
      let targetConversationId = conversationId

      // A resolved conversation is done — sending into it starts a fresh
      // session instead of reopening the old, already-closed thread.
      if (status === "CLOSED" || !targetConversationId) {
        const fresh = await getMyChatbotConversation()
        if (!fresh) {
          setSendError("Something went wrong starting a new conversation. Please try again.")
          return
        }
        applyConversation(fresh)
        targetConversationId = fresh.id
      }

      const optimisticMessage: ChatbotMessageItem = {
        id: `pending-${Date.now()}`,
        role: "USER",
        content: text,
        senderName: null,
        createdAt: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, optimisticMessage])

      let result = await sendChatbotMessage({ conversationId: targetConversationId, message: text })

      // The conversation may have been closed server-side (e.g. by staff)
      // moments after we last checked — start a new session and retry once
      // rather than leaving the user stuck on an error.
      if (!result.success && targetConversationId === conversationId) {
        const fresh = await getMyChatbotConversation()
        if (fresh && fresh.id !== targetConversationId) {
          applyConversation(fresh)
          targetConversationId = fresh.id
          result = await sendChatbotMessage({ conversationId: targetConversationId, message: text })
        }
      }

      if (!result.success) {
        setSendError(result.error)
        return
      }
      if (result.reply) {
        setMessages((prev) => [...prev, result.reply as ChatbotMessageItem])
      }
      setAiUnconfigured(result.simulated)
    } catch {
      setSendError("Something went wrong sending your message. Please try again.")
    } finally {
      setIsSending(false)
      isSendingRef.current = false
    }
  }

  const handleEscalate = async () => {
    if (!conversationId) return
    setIsEscalating(true)
    setEscalateError("")
    try {
      const result = await escalateChatbotConversation({ conversationId })
      if (!result.success) {
        setEscalateError(result.error)
        return
      }
      const refreshed = await getMyChatbotConversation()
      if (refreshed) applyConversation(refreshed)
    } catch {
      setEscalateError("Something went wrong connecting you with support. Please try again.")
    } finally {
      setIsEscalating(false)
    }
  }

  if (!user) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="font-medium text-foreground">Sign in to chat with SAJI Assistant.</p>
        <Button onClick={() => router.push("/auth/login")}>Go to Login</Button>
        <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
    )
  }

  const statusSubtitle = status === "ESCALATED"
    ? assignedStaffName ? `Chatting with ${assignedStaffName} from support` : "Connecting you with a support agent..."
    : "AI-powered support chat"

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-4 shadow-lg flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              {status === "ESCALATED" && assignedStaffName ? <Headset className="h-5 w-5" /> : <Sparkles className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate">{status === "ESCALATED" && assignedStaffName ? "SAJI Support" : "SAJI Assistant"}</h1>
              <p className="text-xs text-blue-100 truncate">{statusSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {status === "ACTIVE" && (
              <Button
                onClick={handleEscalate}
                disabled={isEscalating || isLoading || !conversationId}
                size="sm"
                variant="ghost"
                title="Talk to a human"
                className="text-white hover:bg-white/20 rounded-full gap-1.5 text-xs px-2"
              >
                {isEscalating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
              </Button>
            )}
            <Button onClick={onClose} size="sm" variant="ghost" className="text-white hover:bg-white/20 rounded-full p-2">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {status === "ESCALATED" && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 text-xs text-blue-800 dark:text-blue-300 flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  {assignedStaffName
                    ? `You're connected with ${assignedStaffName} from our support team — they can see this whole conversation.`
                    : "We've let our support team know — someone will join this conversation shortly."}
                </p>
              </div>
            )}

            {messages.map((message) => {
              const isMine = message.role === "USER"
              const isStaff = message.role === "STAFF"
              return (
                <div key={message.id} className={`flex gap-2.5 ${isMine ? "justify-end" : "justify-start"}`}>
                  {!isMine && (
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isStaff ? "bg-gradient-to-br from-emerald-500 to-emerald-600" : "bg-gradient-to-br from-blue-500 to-blue-600"}`}>
                      {isStaff ? <Headset className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] px-4 py-3 rounded-lg ${
                      isMine
                        ? "bg-blue-600 text-white rounded-bl-none"
                        : isStaff
                          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 text-gray-900 dark:text-white rounded-tl-none"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-tl-none"
                    }`}
                  >
                    {isStaff && message.senderName && (
                      <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5">{message.senderName} · SAJI Support</p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className={`text-xs mt-1 ${isMine ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {isMine && (
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              )
            })}

            {isSending && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 rounded-lg rounded-tl-none flex gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">Sending...</span>
                </div>
              </div>
            )}

            {aiUnconfigured && (
              <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                AI replies aren&apos;t fully configured yet — you can still ask to talk to a human.
              </p>
            )}
            {sendError && <p className="text-xs text-red-600 text-center">{sendError}</p>}
            {escalateError && <p className="text-xs text-red-600 text-center">{escalateError}</p>}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 flex-shrink-0">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder={status === "CLOSED" ? "Type a message to start a new conversation..." : "Type your message..."}
            disabled={isSending || isLoading}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isSending || isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {status === "CLOSED"
            ? "Send a new message to start a fresh conversation."
            : status === "ESCALATED"
              ? "You're in a real conversation with our support team."
              : 'Ask me anything about SAJI, or tap "Talk to a human" above to reach our support team.'}
        </p>
      </div>
    </div>
  )
}
