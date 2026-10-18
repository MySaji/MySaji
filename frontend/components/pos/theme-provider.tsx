"use client"

import { createContext, useCallback, useContext, useEffect, useState, type CSSProperties, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { usePathname } from "next/navigation"
import { getTillTheme } from "@/backend/actions/pos-theme"
import { DEFAULT_TILL_COLOR, isTillColor, tillThemeVariables } from "@/backend/domain/pos-theme"

type Theme = NonNullable<Awaited<ReturnType<typeof getTillTheme>>>
const Context = createContext({ color: DEFAULT_TILL_COLOR, scope: "", canCustomize: false, preview: (_color: string | null) => {}, refresh: async () => {} })

export function PosThemeProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const userId = session?.user?.id
  const pathname = usePathname()
  const [saved, setSaved] = useState<{ userId: string; theme: Theme } | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    if (!userId) return
    const theme = await getTillTheme()
    if (theme) { setSaved({ userId, theme }); try { localStorage.setItem(`till-theme:${userId}`, JSON.stringify(theme)) } catch {} }
    else setSaved(null)
  }, [userId])
  useEffect(() => {
    let cancelled = false
    setPreview(null)
    if (!userId) return
    getTillTheme().then(theme => {
      if (cancelled) return
      setSaved(theme ? { userId, theme } : null)
      if (theme) try { localStorage.setItem(`till-theme:${userId}`, JSON.stringify(theme)) } catch {}
    }).catch(() => {
      try {
        const cached = JSON.parse(localStorage.getItem(`till-theme:${userId}`) || "null")
        if (!cancelled && cached && typeof cached.scope === "string" && typeof cached.color === "string" && isTillColor(cached.color)) setSaved({ userId, theme: { scope: cached.scope, color: cached.color, canCustomize: false } })
      } catch {}
    })
    return () => { cancelled = true }
  }, [userId, pathname])
  const theme = saved?.userId === userId ? saved?.theme : null
  const color = theme?.color ?? DEFAULT_TILL_COLOR
  return <Context.Provider value={{ color, scope: theme?.scope ?? "", canCustomize: theme?.canCustomize ?? false, preview: setPreview, refresh }}><div data-till-theme style={tillThemeVariables(preview && theme?.canCustomize ? preview : color) as CSSProperties} className="min-h-dvh">{children}</div></Context.Provider>
}
export const useTillTheme = () => useContext(Context)
