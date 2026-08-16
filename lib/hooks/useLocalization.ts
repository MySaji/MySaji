"use client"

import { useContext } from "react"
import { LocalizationContext } from "@/lib/localization-context"

export function useLocalization() {
  const context = useContext(LocalizationContext)
  if (!context) {
    throw new Error("useLocalization must be used within LocalizationProvider")
  }
  return context
}
