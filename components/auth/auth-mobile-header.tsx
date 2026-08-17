"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft, Globe, ChevronDown } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLocalization } from "@/lib/hooks/useLocalization"
import { languages, languageNames } from "@/lib/i18n/types"

/** Mobile-only top row for the auth pages: a back chevron (shown only on
 * the page's real first step — later steps already have their own in-page
 * "back to previous step" control, so this would just be a confusing second
 * one) and a language switcher. Desktop keeps its existing two-panel layout
 * untouched, hence lg:hidden here rather than folding this into that. */
export function AuthMobileHeader({ showBack = true, onBack }: { showBack?: boolean; onBack?: () => void }) {
  const router = useRouter()
  const { language, setLanguage } = useLocalization()

  const handleBack = () => {
    if (onBack) { onBack(); return }
    if (typeof window !== "undefined" && window.history.length > 1) router.back()
    else router.push("/")
  }

  return (
    <div className="flex items-center justify-between mb-6 lg:hidden">
      {showBack ? (
        <button
          onClick={handleBack}
          aria-label="Go back"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      ) : (
        <span />
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-muted/50 transition-colors">
            <Globe className="w-4 h-4 text-muted-foreground" />
            {languageNames[language]}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {languages.map((lang) => (
            <DropdownMenuItem key={lang} onClick={() => setLanguage(lang)} className={lang === language ? "font-semibold text-primary" : ""}>
              {languageNames[lang]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
