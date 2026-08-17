"use client"

import { ShieldCheck, Leaf } from "lucide-react"
import { LogoMark } from "@/components/logo"

/** Decorative mobile-only hero graphic, sized to sit beside the logo
 * lockup (not as its own full-width row) — a phone mockup showing the SAJI
 * brand mark, a tilted security badge overlapping it, a skyline silhouette
 * behind, and a small plant for warmth. Built from existing UI primitives
 * (no external image asset) so it's theme-aware for free. Purely
 * decorative — safe to hide from assistive tech. */
export function AuthHeroIllustration() {
  return (
    <div className="relative w-28 h-32 sm:w-32 sm:h-36 flex-shrink-0 lg:hidden" aria-hidden="true">
      {/* Skyline silhouette */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-1 opacity-[0.08]">
        <div className="w-3.5 h-6 sm:h-7 bg-primary rounded-t-sm" />
        <div className="w-3.5 h-9 sm:h-10 bg-primary rounded-t-sm" />
        <div className="w-3.5 h-5 sm:h-6 bg-primary rounded-t-sm" />
        <div className="w-3.5 h-8 sm:h-9 bg-primary rounded-t-sm" />
      </div>

      {/* Phone mockup */}
      <div className="absolute left-1/2 top-0 -translate-x-1/2 w-14 h-24 sm:w-16 sm:h-28 rounded-xl border-2 border-primary bg-card shadow-lg overflow-hidden">
        <div className="h-2 bg-primary flex items-center justify-center">
          <div className="w-3 h-0.5 rounded-full bg-white/60" />
        </div>
        <div className="p-1.5 space-y-1 flex flex-col items-center">
          <LogoMark size={16} />
          <div className="h-1 rounded-full bg-muted w-3/4" />
          <div className="h-1 rounded-full bg-muted w-1/2" />
          <div className="w-full h-3.5 rounded bg-primary/15 mt-0.5" />
        </div>
      </div>

      {/* Security badge, overlapping the phone's lower-left */}
      <div className="absolute left-1 bottom-6 w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary shadow-lg flex items-center justify-center -rotate-6">
        <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
      </div>

      {/* Small plant, bottom-right */}
      <div className="absolute right-0 bottom-0 flex flex-col items-center">
        <Leaf className="w-4 h-4 text-emerald-500 -mb-0.5 rotate-12" />
        <div className="w-4 h-3.5 rounded-b-md rounded-t-sm bg-emerald-700/70" />
      </div>
    </div>
  )
}
