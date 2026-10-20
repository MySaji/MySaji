"use client"

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"
import styles from "./information-home.module.css"

export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 400)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])

  if (!visible) return null

  return <button type="button" className={styles.backToTop} aria-label="Back to top" title="Back to top" onClick={() => {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })
    document.getElementById("home-top")?.focus({ preventScroll: true })
  }}><ArrowUp size={21} aria-hidden="true" /></button>
}
