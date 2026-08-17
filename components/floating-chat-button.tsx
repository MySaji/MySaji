"use client"

import { useEffect, useState } from "react"
import { Bot } from "lucide-react"
import { getChatbotUnreadCount } from "@/lib/actions/chatbot"
import { ChatbotWidget } from "@/components/chatbot-widget"

export default function FloatingChatButton() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const load = () => getChatbotUnreadCount().then(setUnreadCount).catch(() => {})
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <div className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 inline-flex items-center justify-center">
        <div className="group relative">
          {/* Pulse Effect */}
          <div className="absolute inset-0 bg-blue-600 rounded-full animate-pulse opacity-20 group-hover:opacity-30 transition-opacity"></div>

          {/* Main Button — pops the chat widget open in place instead of
              navigating to a separate page, same as any embedded support
              widget (Intercom/Crisp-style): a compact floating panel on
              desktop, a full-screen sheet on mobile where there's no room
              to float a panel over the rest of the page. */}
          <button
            onClick={() => setIsOpen((v) => !v)}
            aria-label={isOpen ? "Close chat" : "Open chat"}
            className="relative w-14 h-14 md:w-16 md:h-16 bg-gradient-to-br from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-full shadow-lg hover:shadow-2xl flex items-center justify-center text-white transition-all duration-300 transform hover:scale-110"
          >
            <Bot className="w-6 h-6 md:w-7 md:h-7" />
          </button>

          {/* Badge — real unread assistant-reply count, not a hardcoded "1" */}
          {!isOpen && unreadCount > 0 && (
            <span className="absolute top-0 right-0 min-w-5 h-5 px-1 bg-red-500 rounded-full text-white text-xs font-bold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>

        {/* Tooltip */}
        {!isOpen && (
          <div className="absolute bottom-full right-0 mb-3 bg-gray-900 text-white px-3 py-2 rounded-lg text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            Need help? Chat with us
            <div className="absolute top-full right-2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
          </div>
        )}
      </div>

      {isOpen && (
        <>
          {/* Invisible click-catcher so clicking anywhere else on the page
              (not just the X button) closes the popup on desktop — same
              dismiss behavior as a native dropdown/popover. Harmless on
              mobile where the panel already covers the full screen. */}
          <button
            aria-label="Close chat"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 sm:z-[90] cursor-default"
          />
          <div
            className="fixed inset-0 z-50 sm:z-[100] sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[640px] sm:max-h-[85vh] sm:w-[380px] sm:rounded-2xl sm:shadow-2xl sm:overflow-hidden sm:border sm:border-border"
          >
            <ChatbotWidget onClose={() => setIsOpen(false)} />
          </div>
        </>
      )}
    </>
  )
}
