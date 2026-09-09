"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Touch gestures for the chat: press-and-hold to select, swipe to reply.
 *
 * Both live here rather than in the component because they share one hard
 * constraint — the message list scrolls vertically under the same finger.
 * A naive implementation either fires "long press" while the user is
 * flicking through history, or swallows the scroll entirely. Every handler
 * below is written around telling those three intents apart.
 */

/** Movement (px) after which a touch is a scroll/drag, not a press. */
const MOVE_TOLERANCE = 10
/** How long a finger must stay still before it counts as a hold. */
const HOLD_MS = 450
/** How far a bubble must travel horizontally before releasing triggers a reply. */
const REPLY_THRESHOLD = 56
/** Cap on how far a bubble visually follows the finger. */
const MAX_DRAG = 80

export function useLongPress(onLongPress: () => void, { disabled = false } = {}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    start.current = null
  }, [])

  useEffect(() => clear, [clear])

  const begin = (x: number, y: number) => {
    if (disabled) return
    fired.current = false
    start.current = { x, y }
    timer.current = setTimeout(() => {
      fired.current = true
      // A hold that reaches this point is a deliberate selection, so give the
      // same physical confirmation the platform would.
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15)
      onLongPress()
    }, HOLD_MS)
  }

  const maybeCancel = (x: number, y: number) => {
    if (!start.current) return
    if (Math.abs(x - start.current.x) > MOVE_TOLERANCE || Math.abs(y - start.current.y) > MOVE_TOLERANCE) clear()
  }

  return {
    /** True when the last gesture ended as a long press — let the caller
     *  suppress the click that a browser fires straight afterwards. */
    didLongPress: () => fired.current,
    handlers: {
      onTouchStart: (e: React.TouchEvent) => begin(e.touches[0].clientX, e.touches[0].clientY),
      onTouchMove: (e: React.TouchEvent) => maybeCancel(e.touches[0].clientX, e.touches[0].clientY),
      onTouchEnd: clear,
      onTouchCancel: clear,
      // Mouse equivalents so the same gesture works on desktop, where there
      // is no touch at all and right-click is the usual affordance.
      onMouseDown: (e: React.MouseEvent) => { if (e.button === 0) begin(e.clientX, e.clientY) },
      onMouseMove: (e: React.MouseEvent) => maybeCancel(e.clientX, e.clientY),
      onMouseUp: clear,
      onMouseLeave: clear,
      onContextMenu: (e: React.MouseEvent) => {
        if (disabled) return
        e.preventDefault()
        onLongPress()
      },
    },
  }
}

/**
 * Swipe a bubble sideways to reply to it.
 *
 * Direction is decided once per gesture from the first few pixels and then
 * locked: without that, a diagonal flick both scrolls the list and drags the
 * bubble. Own messages swipe left and others' swipe right, so the bubble
 * always moves away from its own edge and back.
 */
export function useSwipeToReply(onReply: () => void, { mine, disabled = false }: { mine: boolean; disabled?: boolean }) {
  const [offset, setOffset] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<"none" | "x" | "y">("none")

  const direction = mine ? -1 : 1

  const reset = () => { start.current = null; axis.current = "none"; setOffset(0) }

  return {
    offset,
    /** Passed to the bubble so it can show the reply icon appearing. */
    progress: Math.min(1, Math.abs(offset) / REPLY_THRESHOLD),
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        if (disabled) return
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        axis.current = "none"
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!start.current) return
        const dx = e.touches[0].clientX - start.current.x
        const dy = e.touches[0].clientY - start.current.y

        if (axis.current === "none") {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
          // Whichever axis moved more wins, for the rest of this gesture.
          axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
        }
        // A vertical gesture is the list scrolling; leave it entirely alone.
        if (axis.current !== "x") return

        // Only in the reply direction, and damped past the threshold so it
        // stops rather than sliding off the screen.
        const travel = dx * direction
        if (travel <= 0) { setOffset(0); return }
        const damped = travel > REPLY_THRESHOLD ? REPLY_THRESHOLD + (travel - REPLY_THRESHOLD) * 0.25 : travel
        setOffset(Math.min(MAX_DRAG, damped) * direction)
      },
      onTouchEnd: () => {
        if (axis.current === "x" && Math.abs(offset) >= REPLY_THRESHOLD) {
          if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10)
          onReply()
        }
        reset()
      },
      onTouchCancel: reset,
    },
  }
}
