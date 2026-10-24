"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Menu, X } from "lucide-react"
import { OFFERING_LINKS } from "@/backend/domain/public-site"
import styles from "./information-home.module.css"

export function MobileHomeMenu() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", dismiss)
    return () => document.removeEventListener("pointerdown", dismiss)
  }, [open])

  return <div ref={root} className={styles.mobileMenu} onKeyDown={event => {
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus() }
  }}>
    <button ref={trigger} type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="mobile-home-navigation" onClick={() => setOpen(!open)} className={styles.menuToggle}>
      {open ? <X size={21} /> : <Menu size={21} />}
    </button>
    <nav id="mobile-home-navigation" aria-label="Mobile navigation" hidden={!open} className={styles.mobileLinks} onClick={event => { if ((event.target as Element).closest("a")) setOpen(false) }}>
      {OFFERING_LINKS.map(link => <Link key={link.href} href={link.href}>{link.label} <ArrowUpRight size={16} aria-hidden="true" /></Link>)}
      <Link href="/auth/login">Sign in <ArrowUpRight size={16} /></Link>
    </nav>
  </div>
}
