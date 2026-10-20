"use client"

// A short, pleasant two-tone chime for in-app notification arrivals — the
// case OS push notifications don't cover, since browsers only show a real
// system notification (with the device's own sound) while the tab is
// backgrounded/closed. When the tab is open and focused, nothing plays at
// all today; this is that missing cue for the foreground case.
//
// Synthesized with the Web Audio API instead of an audio file: no binary
// asset to host/license, and it can't 404 or go stale. Browsers block
// audio from starting before the user has interacted with the page at
// least once (autoplay policy) — by the time a poll-driven notification
// fires, the user has almost always already clicked/typed something, but
// this fails silently either way rather than throwing.
let sharedContext: AudioContext | null = null
let lastPlayed = 0
let lastDeviceAlert = 0
export function markDeviceNotificationReceived() { lastDeviceAlert = Date.now() }
const SOUND_KEY = "saji:notification-sound"

export function notificationSoundEnabled() {
  try { return localStorage.getItem(SOUND_KEY) !== "off" } catch { return true }
}

export function setNotificationSoundEnabled(enabled: boolean) {
  try { localStorage.setItem(SOUND_KEY, enabled ? "on" : "off") } catch { /* Device preference remains optional. */ }
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!sharedContext) sharedContext = new Ctor()
  return sharedContext
}

function tone(ctx: AudioContext, frequency: number, startAt: number, duration: number, peakGain: number) {
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = "sine"
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(peakGain, startAt + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + duration)
}

export function playNotificationSound(force = false) {
  try {
    if (!force && (!notificationSoundEnabled() || document.visibilityState !== "visible" || Date.now() - lastPlayed < 1200 || Date.now() - lastDeviceAlert < 35000)) return
    const ctx = getContext()
    if (!ctx) return
    lastPlayed = Date.now()
    const play = () => {
      const now = ctx.currentTime
      tone(ctx, 880, now, 0.16, 0.18)
      tone(ctx, 1318.5, now + 0.1, 0.22, 0.16)
    }
    if (ctx.state === "suspended") void ctx.resume().then(play).catch(() => {})
    else if (ctx.state === "running") play()
  } catch {
    // Autoplay-blocked or unsupported — never let a decorative sound cue
    // break the actual notification it's announcing.
  }
}
