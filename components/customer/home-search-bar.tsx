"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Mic, MicOff } from "lucide-react"

// Web Speech API's SpeechRecognition isn't in the standard TS DOM lib types,
// and only ships (as the vendor-prefixed webkitSpeechRecognition) in
// Chromium/Safari — Firefox has no implementation at all. Feature-detected
// at mount so the mic button simply doesn't render rather than throwing in
// an unsupported browser.
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null
}

/** The compact top-of-home search card — replaces the old banner-hero's
 * embedded search form. Voice input is real (native browser
 * SpeechRecognition, transcribed text fed straight into the same search
 * query state as typing), not a decorative mic icon. */
export function HomeSearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [isListening, setIsListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    setVoiceSupported(getSpeechRecognitionCtor() !== null)
  }, [])

  const submitSearch = (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) return
    router.push(`/customer/search?q=${encodeURIComponent(trimmed)}`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submitSearch(query)
  }

  const toggleVoiceSearch = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return

    const recognition = new Ctor()
    recognition.lang = "en-US"
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript as string | undefined
      if (transcript) {
        setQuery(transcript)
        submitSearch(transcript)
      }
    }
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    setIsListening(true)
    recognition.start()
  }

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you need today?"
            className="w-full bg-transparent text-base font-semibold text-foreground placeholder:text-foreground placeholder:font-semibold outline-none"
          />
          <p className="truncate text-xs text-muted-foreground">
            {isListening ? "Listening…" : 'Try "fix leaking sink", "buy tools", "rent equipment", or "find a plumber near me"'}
          </p>
        </div>
        {voiceSupported && (
          <button
            type="button"
            onClick={toggleVoiceSearch}
            aria-label={isListening ? "Stop voice search" : "Search by voice"}
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors ${isListening ? "animate-pulse bg-red-500 text-white" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
      </form>
    </div>
  )
}
