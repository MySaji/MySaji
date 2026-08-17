"use client"

import { ShieldCheck, Leaf } from "lucide-react"
import { LogoMark } from "@/components/logo"

/** Decorative mobile-only hero above the auth forms — a phone mockup
 * showing the SAJI brand mark, a tilted security badge overlapping it, a
 * skyline silhouette behind, and a small plant for warmth. Built from
 * existing UI primitives (no external image asset) so it's theme-aware for
 * free. Purely decorative — safe to hide from assistive tech. */
export function AuthHeroIllustration() {
  return (
    <div className="relative h-36 sm:h-44 w-full mb-6 lg:hidden" aria-hidden="true">
      {/* Skyline silhouette */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-1.5 opacity-[0.08]">
        <div className="w-6 h-10 sm:h-12 bg-primary rounded-t-sm" />
        <div className="w-6 h-16 sm:h-20 bg-primary rounded-t-sm" />
        <div className="w-6 h-8 sm:h-10 bg-primary rounded-t-sm" />
        <div className="w-6 h-14 sm:h-16 bg-primary rounded-t-sm" />
        <div className="w-6 h-6 sm:h-8 bg-primary rounded-t-sm" />
      </div>

      {/* Phone mockup */}
      <div className="absolute left-1/2 top-1 -translate-x-1/2 w-24 h-36 sm:w-28 sm:h-40 rounded-[1.25rem] border-[3px] border-primary bg-card shadow-xl overflow-hidden">
        <div className="h-3 bg-primary flex items-center justify-center">
          <div className="w-6 h-1 rounded-full bg-white/60" />
        </div>
        <div className="p-2.5 space-y-2 flex flex-col items-center">
          <LogoMark size={26} />
          <div className="h-1.5 rounded-full bg-muted w-3/4" />
          <div className="h-1.5 rounded-full bg-muted w-1/2" />
          <div className="w-full h-6 rounded-lg bg-primary/15 mt-1" />
        </div>
      </div>

      {/* Security badge, overlapping the phone's lower-left */}
      <div className="absolute left-1/2 -translate-x-[6.2rem] sm:-translate-x-[7.2rem] bottom-4 w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-primary shadow-lg flex items-center justify-center -rotate-6">
        <ShieldCheck className="w-6 h-6 text-primary-foreground" />
      </div>

      {/* Small plant, bottom-right */}
      <div className="absolute right-4 sm:right-10 bottom-0 flex flex-col items-center">
        <Leaf className="w-6 h-6 text-emerald-500 -mb-1 rotate-12" />
        <div className="w-6 h-5 rounded-b-md rounded-t-sm bg-emerald-700/70" />
      </div>
    </div>
  )
}
