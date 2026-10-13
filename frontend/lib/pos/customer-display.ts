"use client"

/**
 * The link between the cashier's screen and the screen the customer reads.
 *
 * A counter POS has two monitors: the till, facing the cashier, and a smaller
 * one turned towards the queue so the customer can watch their own basket go
 * up. This module is the contract between those two browser windows.
 *
 * WHY BroadcastChannel RATHER THAN THE SERVER
 *
 * Both windows are on the same machine and the same origin, so the basket
 * never needs to leave it. Going through the server would put a network round
 * trip between scanning an item and the customer seeing it, and would stop
 * working in exactly the situation a Kenyan counter most needs it to keep
 * working: the line is down. Nothing here touches the network, so the
 * customer display is as reliable as the till itself.
 *
 * It also means the display window fetches nothing and is given nothing but
 * the basket in front of it. Opening it without a till running shows an idle
 * screen, which is why the route needs no session of its own.
 */

export const DISPLAY_CHANNEL = "saji-customer-display"

export type DisplayLine = {
  id: string
  name: string
  variant?: string | null
  quantity: number
  unit: string
  unitPrice: number
  total: number
}

/** What the customer screen is showing right now. */
export type DisplayState =
  | { kind: "idle"; shopName: string }
  | {
      kind: "sale"
      shopName: string
      lines: DisplayLine[]
      subtotal: number
      discount: number
      points: number
      tax: number
      total: number
    }
  /** Held after a sale finishes, so the customer can check their change. */
  | { kind: "paid"; shopName: string; total: number; paid: number; change: number }

type Message =
  | { type: "state"; state: DisplayState }
  /** Sent by a display that has just opened. A reload must not leave the
   *  customer staring at a blank screen until the next item is scanned, and
   *  a channel has no history, so the display asks and the till answers. */
  | { type: "hello" }

function open(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null
  try {
    return new BroadcastChannel(DISPLAY_CHANNEL)
  } catch {
    return null
  }
}

/**
 * Till side. Publish whenever the basket changes.
 *
 * The last state published is remembered so a display that opens or reloads
 * mid-sale can ask for it, rather than showing an empty screen to a customer
 * whose shopping is already on the counter.
 */
export function createDisplayPublisher() {
  const ch = open()
  let last: DisplayState | null = null
  if (!ch) return { publish: (_s: DisplayState) => {}, close: () => {} }

  const send = (state: DisplayState) => {
    try {
      ch.postMessage({ type: "state", state } satisfies Message)
    } catch {
      // A channel closed during teardown is not worth surfacing at a till.
    }
  }

  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.type === "hello" && last) send(last)
  }

  return {
    publish: (state: DisplayState) => { last = state; send(state) },
    close: () => { try { ch.close() } catch {} },
  }
}

/** Display side. Calls onState whenever the till publishes. */
export function subscribeToDisplay(onState: (s: DisplayState) => void): () => void {
  const ch = open()
  if (!ch) return () => {}

  ch.onmessage = (e: MessageEvent<Message>) => {
    if (e.data?.type === "state") onState(e.data.state)
  }
  try {
    ch.postMessage({ type: "hello" } satisfies Message)
  } catch {}

  return () => { try { ch.close() } catch {} }
}

/**
 * Opens the customer screen, on the second monitor where the browser will say
 * where that is.
 *
 * getScreenDetails is the Window Management API: Chrome only, and it asks the
 * person once. Where it is unavailable or declined, the window still opens and
 * the cashier drags it across, which is what they would have done anyway. The
 * feature is therefore never gated on the permission.
 */
export async function openCustomerDisplay(): Promise<Window | null> {
  const url = "/till-display"
  const anyWindow = window as unknown as {
    getScreenDetails?: () => Promise<{ screens: Array<{ left: number; top: number; width: number; height: number; isPrimary: boolean }> }>
  }

  if (typeof anyWindow.getScreenDetails === "function") {
    try {
      const details = await anyWindow.getScreenDetails()
      const second = details.screens.find((s) => !s.isPrimary)
      if (second) {
        return window.open(
          url,
          "saji-customer-display",
          "left=" + second.left + ",top=" + second.top +
            ",width=" + second.width + ",height=" + second.height,
        )
      }
    } catch {
      // Declined or unsupported. Fall through to an ordinary window.
    }
  }

  return window.open(url, "saji-customer-display", "width=1024,height=768")
}
