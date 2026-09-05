"use client"

import { useEffect, useRef, useState } from "react"
import { Play, Pause, AlertCircle } from "lucide-react"

/** Only one voice note plays at a time across the whole thread — starting a
 * second one pauses the first, rather than letting several overlap. */
let currentlyPlaying: HTMLAudioElement | null = null

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

/** An inline, seekable player for a VOICE message.
 *
 * Replaces a fire-and-forget `new Audio(url).play()` that gave the listener
 * no way to pause, no progress, no duration, and — because its rejection
 * was swallowed — no sign at all when playback failed.
 *
 * MediaRecorder's webm blobs report `duration: Infinity` until the stream
 * has been seeked once, which is why the metadata handler nudges
 * currentTime before trusting the value. Until a real duration is known the
 * label the sender recorded with (e.g. "Voice message (0:05)") is shown
 * instead, so the bubble is never blank.
 */
export function VoiceMessagePlayer({
  src,
  label,
  playLabel,
  pauseLabel,
  unavailableLabel,
}: {
  src: string | null
  label: string
  playLabel: string
  pauseLabel: string
  unavailableLabel: string
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // True only while the duration-probing seek below is in flight, so the
  // sentinel currentTime it produces never reaches the visible timestamp.
  const isProbingRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (!audio) return
      audio.pause()
      if (currentlyPlaying === audio) currentlyPlaying = null
    }
  }, [])

  if (!src) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-80">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        {unavailableLabel}
      </div>
    )
  }

  const toggle = async () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      return
    }
    if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause()
    try {
      await audio.play()
      currentlyPlaying = audio
    } catch {
      setFailed(true)
    }
  }

  // Infinity/NaN duration from a MediaRecorder webm: seeking to the far end
  // forces the browser to resolve the real length, after which we rewind.
  const resolveDuration = () => {
    const audio = audioRef.current
    if (!audio) return
    if (Number.isFinite(audio.duration)) {
      setDuration(audio.duration)
      return
    }
    const onSeeked = () => {
      if (Number.isFinite(audio.duration)) setDuration(audio.duration)
      audio.currentTime = 0
      setElapsed(0)
      isProbingRef.current = false
      audio.removeEventListener("seeked", onSeeked)
    }
    audio.addEventListener("seeked", onSeeked)
    try {
      isProbingRef.current = true
      audio.currentTime = 1e101
    } catch {
      isProbingRef.current = false
      audio.removeEventListener("seeked", onSeeked)
    }
  }

  const progressPct = duration && duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const next = (Number(event.target.value) / 100) * duration
    audio.currentTime = next
    setElapsed(next)
  }

  return (
    <div className="flex min-w-[190px] items-center gap-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? pauseLabel : playLabel}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>

      <div className="min-w-0 flex-1">
        {/* A native range input keeps this keyboard-accessible and draggable
            without hand-rolling pointer maths. It only becomes seekable once
            a real duration is known. */}
        <input
          type="range"
          min={0}
          max={100}
          value={progressPct}
          onChange={seek}
          disabled={!duration}
          aria-label={label}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-black/15 accent-current disabled:cursor-default dark:bg-white/20"
        />
        <p className="mt-1 text-[10px] opacity-70">
          {failed ? unavailableLabel : duration ? `${formatClock(elapsed)} / ${formatClock(duration)}` : label}
        </p>
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={resolveDuration}
        onTimeUpdate={(e) => {
          if (isProbingRef.current) return
          setElapsed(e.currentTarget.currentTime)
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false)
          setElapsed(0)
          if (audioRef.current) audioRef.current.currentTime = 0
        }}
        onError={() => setFailed(true)}
        className="hidden"
      />
    </div>
  )
}
