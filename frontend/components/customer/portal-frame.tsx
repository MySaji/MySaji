"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, Columns2 } from "lucide-react"
import { useAuthContext } from "@/frontend/lib/auth-context"
import { CUSTOMER_SECTIONS, customerSection } from "@/backend/domain/customer-navigation"

export function CustomerPortalFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { user } = useAuthContext()
  const [preference, setPreference] = useState<{ userId: string; compact: boolean } | null>(null)
  useEffect(() => {
    if (!user?.id) return
    try {
      setPreference({
        userId: user.id,
        compact: localStorage.getItem(`saji:customer:spacing:${user.id}`) === "compact",
      })
    } catch {
      setPreference({ userId: user.id, compact: false })
    }
  }, [user?.id])
  const section = customerSection(pathname),
    compact = preference?.userId === user?.id && preference?.compact === true
  if (pathname.startsWith("/customer/messages")) return <>{children}</>
  const changeSpacing = () => {
    if (!user?.id) return
    setPreference({ userId: user.id, compact: !compact })
    try {
      localStorage.setItem(`saji:customer:spacing:${user.id}`, compact ? "comfortable" : "compact")
    } catch {
      /* Preference still works for the current page. */
    }
  }
  return (
    <div className="customer-portal-frame" data-density={compact ? "compact" : "comfortable"}>
      {section && (
        <div className="customer-context">
          <nav
            aria-label="Customer breadcrumb"
            className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
          >
            <Link href="/customer/home" className="shrink-0 hover:text-primary">
              Home
            </Link>
            {section.key !== "home" && (
              <>
                <ChevronRight size={13} />
                <span className="truncate" aria-current="page">
                  {section.label}
                </span>
                {pathname.split("/").filter(Boolean).length > 2 && (
                  <>
                    <ChevronRight size={13} />
                    <span>Details</span>
                  </>
                )}
              </>
            )}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Related customer pages" className="flex flex-wrap gap-2">
              {section.related.slice(0, 2).map((key) => {
                const item = CUSTOMER_SECTIONS.find((page) => page.key === key)
                return item ? (
                  <Link key={key} href={`/customer/${key}`} className="customer-context-link">
                    {item.label}
                    <ChevronRight size={13} />
                  </Link>
                ) : null
              })}
            </nav>
            <button
              type="button"
              onClick={changeSpacing}
              aria-pressed={compact}
              aria-label="Use compact page spacing"
              title="Change page spacing"
              className="customer-context-link"
            >
              <Columns2 size={14} />
              <span>{compact ? "Compact" : "Comfortable"}</span>
            </button>
          </div>
        </div>
      )}
      <div className="customer-content">{children}</div>
    </div>
  )
}
