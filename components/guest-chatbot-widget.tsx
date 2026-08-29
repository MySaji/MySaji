"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Send, X, Loader2, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LogoMark } from "@/components/logo"
import { sendGuestChatbotMessage } from "@/lib/actions/guest-chatbot"

type GuestMessage = { id: string; role: "user" | "assistant"; content: string }

const WELCOME_MESSAGE =
  "Hi! I'm SAJI Assistant. Ask me anything about how SAJI works: booking services, buying from local shops, becoming a provider, and more. Sign in for full support (order-specific help, live human handoff)."

/** Public, no-login chat for the marketing landing page — pre-signup
 * visitors asking "how does this work" shouldn't have to create an
 * account first just to ask. Deliberately lighter than the signed-in
 * ChatbotWidget: history lives only in this component's state (nothing
 * persisted server-side, so it resets on refresh/close), and there's no
 * escalate-to-a-human option since there's no account/ticket for a real
 * agent to pick up. */
export function GuestChatbotWidget({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<GuestMessage[]>([{ id: "welcome", role: "assistant", content: WELCOME_MESSAGE }])
  const [inputValue, setInputValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState("")
  const [aiUnconfigured, setAiUnconfigured] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    const text = inputValue.trim()
    if (!text || isSending) return
    setInputValue("")
    setError("")
    setIsSending(true)

    const userMessage: GuestMessage = { id: `u-${Date.now()}`, role: "user", content: text }
    setMessages((prev) => [...prev, userMessage])

    const history = messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }))

    const result = await sendGuestChatbotMessage({ history, message: text })
    setIsSending(false)
    if (!result.success) {
      setError(result.error)
      return
    }
    setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: result.reply }])
    setAiUnconfigured(result.simulated)
  }

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-4 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/20">
              <LogoMark size={40} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold">SAJI Assistant</h1>
              <p className="truncate text-xs text-blue-100">Ask me anything about SAJI</p>
            </div>
          </div>
          <Button onClick={onClose} size="sm" variant="ghost" className="flex-shrink-0 rounded-full p-2 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.map((message) => {
          const isMine = message.role === "user"
          return (
            <div key={message.id} className={`flex gap-2.5 ${isMine ? "justify-end" : "justify-start"}`}>
              {!isMine && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
                  <LogoMark size={32} className="h-full w-full object-cover" />
                </div>
              )}
              <div className={`max-w-[78%] rounded-lg px-4 py-3 ${isMine ? "rounded-bl-none bg-blue-600 text-white" : "rounded-tl-none bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white"}`}>
                <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              </div>
            </div>
          )
        })}

        {isSending && (
          <div className="flex justify-start gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">
              <LogoMark size={32} className="h-full w-full object-cover" />
            </div>
            <div className="flex gap-2 rounded-lg rounded-tl-none bg-gray-100 px-4 py-3 dark:bg-gray-700">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm text-gray-600 dark:text-gray-300">Thinking...</span>
            </div>
          </div>
        )}

        {aiUnconfigured && (
          <p className="text-center text-xs text-amber-600 dark:text-amber-400">
            AI replies aren&apos;t fully configured yet. Please check back soon, or sign in to reach our support team.
          </p>
        )}
        {error && <p className="text-center text-xs text-red-600">{error}</p>}

        <div ref={messagesEndRef} />
      </div>

      {/* Sign-in nudge */}
      <Link
        href="/auth/login"
        className="flex flex-shrink-0 items-center justify-center gap-1.5 border-t border-border/60 bg-blue-50/60 px-4 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:bg-blue-900/10 dark:text-blue-300 dark:hover:bg-blue-900/20"
      >
        <LogIn className="h-3.5 w-3.5" /> Sign in for account-specific help & a real support agent
      </Link>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask about SAJI..."
            disabled={isSending}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
          />
          <Button onClick={handleSend} disabled={!inputValue.trim() || isSending} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
