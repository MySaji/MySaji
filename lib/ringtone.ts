"use client"

/**
 * The ring for an incoming call.
 *
 * A web page cannot use the device's own ringtone. No browser exposes the
 * system ringtone, the user's chosen tone, or the ringer channel to a page —
 * that is deliberate, and there is no permission that unlocks it. Only a
 * native app (or a real dialer integration) can ring the way the phone app
 * does.
 *
 * So this synthesises the closest honest equivalent: the standard two-tone
 * telephone ring (440 Hz + 480 Hz, two seconds on, four off) generated with
 * the Web Audio API, plus the phone's vibration motor in the same cadence.
 * Synthesised rather than shipped as an audio file so it adds nothing to the
 * bundle and starts instantly — a ring that arrives after a download has
 * already missed the moment.
 *
 * It also respects the one thing a system ringtone would: silence. If the
 * browser refuses to start audio (no user gesture yet, or the device is
 * muted) the vibration still runs, so a call is not missed in silence.
 */

const RING_HZ = [440, 480]
const ON_SECONDS = 2
const OFF_SECONDS = 4
/** Comfortably below full scale — this plays unexpectedly, so it should not
 *  arrive at maximum volume. */
const GAIN = 0.18

type Ringer = { stop: () => void }

let active: Ringer | null = null

function vibratePattern(): number[] {
  // [buzz, pause, buzz, pause…] in ms, matching the audible cadence so the
  // two read as one signal rather than two competing ones.
  return [ON_SECONDS * 1000, OFF_SECONDS * 1000]
}

/**
 * Starts ringing, and keeps ringing until `stopRinging()`.
 *
 * Safe to call repeatedly — a second call while already ringing is ignored
 * rather than layering a second tone on top of the first.
 */
export function startRinging(): void {
  if (active) return
  if (typeof window === "undefined") return

  let stopped = false
  let cycleTimer: ReturnType<typeof setTimeout> | null = null
  let context: AudioContext | null = null

  // Vibration is independent of audio: it must still run when the browser
  // blocks sound, which is exactly the case where a silent phone needs it.
  try {
    navigator.vibrate?.(vibratePattern())
  } catch {
    // Unsupported (desktop, iOS Safari) — nothing to fall back to.
  }
  const vibrateTimer = setInterval(() => {
    try { navigator.vibrate?.(vibratePattern()) } catch { /* as above */ }
  }, (ON_SECONDS + OFF_SECONDS) * 1000)

  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctor) {
      context = new Ctor()
      // Suspended when the page has had no user gesture. Resuming may be
      // refused; the vibration above is the fallback either way.
      void context.resume().catch(() => {})

      const ringOnce = () => {
        if (stopped || !context) return
        const now = context.currentTime
        const gain = context.createGain()
        gain.connect(context.destination)
        // Eased in and out so each burst does not click.
        gain.gain.setValueAtTime(0, now)
        gain.gain.linearRampToValueAtTime(GAIN, now + 0.05)
        gain.gain.setValueAtTime(GAIN, now + ON_SECONDS - 0.05)
        gain.gain.linearRampToValueAtTime(0, now + ON_SECONDS)

        for (const hz of RING_HZ) {
          const osc = context.createOscillator()
          osc.type = "sine"
          osc.frequency.setValueAtTime(hz, now)
          osc.connect(gain)
          osc.start(now)
          osc.stop(now + ON_SECONDS)
        }
        cycleTimer = setTimeout(ringOnce, (ON_SECONDS + OFF_SECONDS) * 1000)
      }
      ringOnce()
    }
  } catch {
    // Audio unavailable entirely — vibration carries the signal.
  }

  active = {
    stop: () => {
      stopped = true
      if (cycleTimer) clearTimeout(cycleTimer)
      clearInterval(vibrateTimer)
      try { navigator.vibrate?.(0) } catch { /* as above */ }
      void context?.close().catch(() => {})
    },
  }
}

export function stopRinging(): void {
  active?.stop()
  active = null
}
