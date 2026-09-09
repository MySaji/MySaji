"use client"

import { useEffect, useState } from "react"
import { Search, Loader2, MessageCircle, ArrowLeft, UserPlus } from "lucide-react"
import { searchMessageableUsers, getOrCreateConversation, type MessageableUser } from "@/lib/actions/messages"
import { useLocalization } from "@/lib/hooks/useLocalization"
import type { UserRole } from "@/lib/types"

const ROLE_FILTER_OPTIONS: { value: UserRole | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "customer", label: "Customers" },
  { value: "provider", label: "Providers" },
  { value: "shopkeeper", label: "Shopkeepers" },
  { value: "admin", label: "Admins" },
  { value: "sub-admin", label: "Sub-Admins" },
  { value: "agent", label: "Agents" },
  { value: "secretary", label: "Secretaries" },
]

/**
 * Starting a new chat, as a screen rather than a dialog.
 *
 * It was a centred popup, which is the wrong shape for this: on a phone a
 * modal over a chat leaves the list showing through around a cramped box, and
 * the results — a scrolling list of people, the main thing here — got a
 * ~320px window inside it. As a panel it uses the whole chat area on both
 * sizes, so the same component reads as a proper "New chat" screen on mobile
 * and fills the empty thread pane on desktop.
 */
export function NewConversationModal({
  open,
  onClose,
  onConversationCreated,
  showRoleFilter = false,
}: {
  open: boolean
  onClose: () => void
  onConversationCreated: (conversationId: string) => void
  showRoleFilter?: boolean
}) {
  const { t } = useLocalization()
  const [query, setQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all")
  const [results, setResults] = useState<MessageableUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setIsLoading(true)
    const handle = setTimeout(() => {
      searchMessageableUsers({ query: query || undefined, roleFilter: roleFilter === "all" ? undefined : roleFilter })
        .then(setResults)
        .finally(() => setIsLoading(false))
    }, 300)
    return () => clearTimeout(handle)
  }, [open, query, roleFilter])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setRoleFilter("all")
      setResults([])
      setError(null)
    }
  }, [open])

  const handlePick = async (user: MessageableUser) => {
    setStartingId(user.id)
    setError(null)
    try {
      const result = await getOrCreateConversation({ otherUserId: user.id })
      if (!result.success) {
        setError(result.error)
        return
      }
      onConversationCreated(result.conversationId)
      onClose()
    } catch {
      setError("Couldn't start this conversation. Please try again.")
    } finally {
      setStartingId(null)
    }
  }

  if (!open) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border/60 bg-card px-3 py-3 sm:px-4">
        <button onClick={onClose} aria-label={t("common.back")} className="rounded-lg p-1.5 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
          <UserPlus className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{t("chat.newMessageTitle")}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{t("chat.newMessageSubtitle")}</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("chat.searchPeoplePlaceholder")}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {showRoleFilter && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ROLE_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRoleFilter(opt.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  roleFilter === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center px-4">
              <MessageCircle className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {query ? t("chat.noMatchingUsers") : t("chat.startTypingToSearch")}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {results.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handlePick(user)}
                  disabled={startingId !== null}
                  className="flex w-full items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-sm font-semibold flex-shrink-0">
                    {user.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.roleLabel} · {user.email}</p>
                  </div>
                  {startingId === user.id && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
