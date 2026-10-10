"use client"

import { useState, useEffect, useCallback } from "react"

const STORAGE_KEY = "saji_sidebar_collapsed"

/** Desktop-only sidebar collapse-to-icons preference, shared across every
 * portal and persisted per-browser (one shared key — it's a general UI
 * preference, not something that should reset per portal). Mobile's own
 * open/close drawer is a separate interaction this doesn't touch. */
export function useSidebarCollapsed() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "true") setIsCollapsed(true)
  }, [])

  const toggle = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }, [])

  return { isCollapsed, toggle }
}
