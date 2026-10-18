"use client"

import useSWR from "swr"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { getMessages, type ChatMessage } from "@/backend/actions/messages"

// Every portal's Messages page duplicated the same flat setInterval(5000)
// poll for the open conversation (7 copies). SWR's refreshInterval gives
// the same 5s cadence but for free also pauses while the tab is hidden and
// revalidates immediately on focus — strictly smarter than the interval it
// replaces, with less code at each of the 7 call sites.
const MESSAGE_POLL_MS = 5000

export function useConversationMessages(conversationId: string | null) {
  const { user } = useAuthContext()
  const { data, mutate, isLoading, error } = useSWR(
    conversationId && user?.id ? ["messages", conversationId, user.id] : null,
    ([, id]: [string, string, string]) => getMessages(id),
    { refreshInterval: MESSAGE_POLL_MS, revalidateOnFocus: true },
  )
  return { messages: data ?? [], mutateMessages: mutate, isLoadingMessages: isLoading, messagesError: error }
}

export type { ChatMessage }
