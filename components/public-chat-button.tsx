"use client"

import { useState } from "react"
import { Bot } from "lucide-react"
import { GuestChatbotWidget } from "@/components/guest-chatbot-widget"

/** The landing page's own chat entry point — same popup shell/behavior as
 * components/floating-chat-button.tsx (full-screen on mobile, a
 * phone-sized floating panel on desktop, click-outside-to-close), but
 * opens the no-login GuestChatbotWidget instead. Kept as a separate
 * component rather than reusing FloatingChatButton because that one is
 * hard-wired to the signed-in ChatbotWidget (unread-count polling included)
 * — this page has no session to poll against. */
export default function PublicChatButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <div className="fixed bottom-6 right-4 z-40 inline-flex items-center justify-center lg:bottom-6 lg:right-6">
        <div className="group relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-blue-600 opacity-20 transition-opacity group-hover:opacity-30" />
          <button
            onClick={() => setIsOpen((v) => !v)}
            aria-label={isOpen ? "Close chat" : "Open chat"}
            className="relative flex h-14 w-14 transform items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-2xl hover:from-blue-700 hover:to-blue-800 md:h-16 md:w-16"
          >
            <Bot className="h-6 w-6 md:h-7 md:w-7" />
          </button>
        </div>

        {!isOpen && (
          <div className="pointer-events-none absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            Questions about SAJI? Chat with us
            <div className="absolute top-full right-2 h-2 w-2 rotate-45 bg-gray-900" />
          </div>
        )}
      </div>

      {isOpen && (
        <>
          <button
            aria-label="Close chat"
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="fixed inset-0 z-50 sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[640px] sm:max-h-[85vh] sm:w-[380px] sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-2xl">
            <GuestChatbotWidget onClose={() => setIsOpen(false)} />
          </div>
        </>
      )}
    </>
  )
}
