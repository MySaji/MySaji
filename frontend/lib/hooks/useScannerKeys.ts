"use client"

import { useEffect, useRef } from "react"

/**
 * A counter barcode scanner, anywhere on the page.
 *
 * WHAT THESE DEVICES ACTUALLY ARE
 *
 * The handheld and flatbed scanners on a supermarket counter are keyboards.
 * They have no driver and no API: they type the digits of the barcode and
 * press Enter, as fast as the machine can send them. Which means they type
 * into whatever has focus, and if nothing useful has focus they type into
 * nothing at all.
 *
 * That is the whole problem this solves. A till with a focused search box
 * works beautifully until the cashier taps a quantity, a tile, or anything
 * else, and then the next scan vanishes. At a counter with a queue, a scan
 * that silently does nothing is worse than a slow one, because the cashier
 * does not notice until the total is wrong.
 *
 * HOW A SCANNER IS TOLD FROM A PERSON
 *
 * By speed. A scanner sends its characters a few milliseconds apart; nobody
 * types thirteen digits in under a tenth of a second. So the keys are
 * buffered, a gap longer than `gapMs` throws the buffer away, and only a
 * burst that arrives fast and ends with Enter counts as a scan.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH
 *
 * Anything typed into a field. If the cashier has clicked into a box to type
 * a discount, a weight or a customer's name, those keystrokes are theirs and
 * this stays out of the way: the till's own inputs keep their behaviour and
 * nothing is intercepted twice. The scanner is captured only when the keys
 * would otherwise go nowhere.
 */

export type ScannerOptions = {
  /** Longest gap between two keys that still counts as one burst. */
  gapMs?: number
  /** Shortest string worth treating as a barcode. */
  minLength?: number
  /** Off while a dialog owns the screen, or on a page that is not selling. */
  enabled?: boolean
}

export function useScannerKeys(
  onScan: (code: string) => void,
  { gapMs = 60, minLength = 4, enabled = true }: ScannerOptions = {},
) {
  // Held in refs rather than state: a keystroke must not re-render the till,
  // and the handler has to see the latest callback without being rebound on
  // every render.
  const buffer = useRef("")
  const lastAt = useRef(0)
  const handler = useRef(onScan)
  handler.current = onScan

  useEffect(() => {
    if (!enabled) return

    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      )
    }

    const onKeyDown = (e: KeyboardEvent) => {
      // Their keys, not the scanner's. The focused field handles its own
      // Enter, including the search box's existing "one result, add it".
      if (isTypingTarget(e.target)) return

      const now = Date.now()
      if (now - lastAt.current > gapMs) buffer.current = ""
      lastAt.current = now

      if (e.key === "Enter") {
        const code = buffer.current
        buffer.current = ""
        if (code.length >= minLength) {
          // Stops the Enter also pressing whatever button has focus, which
          // at a till could be "Take payment".
          e.preventDefault()
          handler.current(code)
        }
        return
      }

      // Only the characters a barcode is made of. Modifier presses and
      // arrows are ignored rather than breaking the burst, so a stray Shift
      // from the scanner's own prefix does not throw the code away.
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer.current += e.key
      }
    }

    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [enabled, gapMs, minLength])
}
