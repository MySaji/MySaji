"use client"

import { useRouter } from "next/navigation"
import { ChatbotWidget } from "@/frontend/components/chatbot-widget"

/** Direct-link fallback for the chat (e.g. a bookmarked/shared URL) — the
 * floating chat button elsewhere in the app no longer navigates here, it
 * pops ChatbotWidget open in place instead. This route just hosts the same
 * widget full-screen so the link still works on its own. */
export default function ChatbotPage() {
  const router = useRouter()
  return (
    <div className="fixed inset-0 z-50">
      <ChatbotWidget onClose={() => router.back()} />
    </div>
  )
}
