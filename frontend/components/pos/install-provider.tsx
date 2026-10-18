"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type InstallEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const InstallContext = createContext({
  available: false, standalone: false, isIos: false, secure: true, error: "",
  install: async () => {},
})

export function TillInstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [secure, setSecure] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)")
    const updateDisplay = () => setStandalone(media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
    updateDisplay()
    setIsIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1))
    setSecure(window.isSecureContext)
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent) }
    const installed = () => { setPrompt(null); setStandalone(true) }
    window.addEventListener("beforeinstallprompt", capture)
    window.addEventListener("appinstalled", installed)
    media.addEventListener("change", updateDisplay)
    if (window.isSecureContext && "serviceWorker" in navigator) {
      const worker = process.env.NODE_ENV === "production" ? "/pos/sw.js" : "/pos/sw.js?dev=1"
      navigator.serviceWorker.register(worker, { scope: "/pos/", updateViaCache: "none" })
        .then(async (registration) => {
          await registration.update()
          if (process.env.NODE_ENV === "production") registration.active?.postMessage("precache")
        })
        .catch(() => setError("Till could not prepare installation. Check your connection and reload this page."))
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", capture)
      window.removeEventListener("appinstalled", installed)
      media.removeEventListener("change", updateDisplay)
    }
  }, [])

  const install = async () => {
    if (!prompt) return
    setError("")
    try {
      await prompt.prompt()
      await prompt.userChoice
      // Only appinstalled confirms completion; accepting a prompt does not.
    } catch {
      setError("The installation prompt could not open. Use your browser's Install app menu instead.")
    } finally { setPrompt(null) }
  }

  return <InstallContext.Provider value={{ available: !!prompt, standalone, isIos, secure, error, install }}>{children}</InstallContext.Provider>
}

export const useTillInstall = () => useContext(InstallContext)
