"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  isOfflineStoreAvailable, cacheCatalogue, readCatalogue, readOutbox,
  enqueueSale, dequeueSale, markSending, markFailed, retrySale, discardSale,
  type CachedProduct, type QueuedSale,
} from "@/lib/pos-offline"
import { recordPosSale, type Receipt } from "@/lib/actions/pos-sales"

/**
 * Connection state and the sale queue, for the till.
 *
 * ---------------------------------------------------------------------------
 * navigator.onLine IS A HINT, NOT THE ANSWER
 * ---------------------------------------------------------------------------
 * It reports "online" for a machine attached to a wifi router with no
 * upstream, and for a captive portal that is intercepting every request —
 * both extremely common in a Kenyan shopping centre. Trusting it would make
 * the till claim it is connected while every sale fails.
 *
 * So the authority here is what actually happened to the last request. A
 * thrown fetch means the server was unreachable; a returned result, even a
 * refusal, means it was reached. `navigator.onLine` is used only to notice
 * a reconnection quickly, and only ever to TRY again.
 *
 * ---------------------------------------------------------------------------
 * A REFUSAL IS NOT A FAILURE TO SEND
 * ---------------------------------------------------------------------------
 * The two have to be told apart, because they need opposite handling:
 *
 *   thrown         -> the server was not reached. Keep it pending, retry.
 *   { success:false } -> the server was reached and said no. Stop retrying,
 *                     show it to a person. Retrying forever would hide a
 *                     sale the shop believes it made.
 */

export type ConnectionState = "online" | "offline" | "checking"

export type PosOfflineState = {
  /** Whether the local store could be opened at all. */
  available: boolean
  connection: ConnectionState
  queue: QueuedSale[]
  pendingCount: number
  failedCount: number
  catalogue: CachedProduct[]
  catalogueUpdatedAt: string | null
  syncing: boolean
}

export function usePosOffline() {
  const [state, setState] = useState<PosOfflineState>({
    available: false,
    connection: "online",
    queue: [],
    pendingCount: 0,
    failedCount: 0,
    catalogue: [],
    catalogueUpdatedAt: null,
    syncing: false,
  })

  // Guards a replay against re-entry: the interval, a reconnect event and a
  // manual tap can all fire within the same second, and sending the same
  // entry three times in parallel is pointless load even though the
  // idempotency key makes it harmless.
  const syncing = useRef(false)

  const refreshQueue = useCallback(async () => {
    if (!isOfflineStoreAvailable()) return
    try {
      const queue = await readOutbox()
      setState((s) => ({
        ...s,
        queue,
        pendingCount: queue.filter((q) => q.status !== "failed").length,
        failedCount: queue.filter((q) => q.status === "failed").length,
      }))
    } catch {
      // A store that cannot be read is a store the till does without.
    }
  }, [])

  // --- open the store, load what is there ---------------------------------
  useEffect(() => {
    let cancelled = false
    if (!isOfflineStoreAvailable()) {
      setState((s) => ({ ...s, available: false }))
      return
    }
    ;(async () => {
      try {
        const [{ products, updatedAt }, queue] = await Promise.all([readCatalogue(), readOutbox()])
        if (cancelled) return
        setState((s) => ({
          ...s,
          available: true,
          catalogue: products,
          catalogueUpdatedAt: updatedAt,
          queue,
          pendingCount: queue.filter((q) => q.status !== "failed").length,
          failedCount: queue.filter((q) => q.status === "failed").length,
        }))
      } catch {
        if (!cancelled) setState((s) => ({ ...s, available: false }))
      }
    })()
    return () => { cancelled = true }
  }, [])

  // --- replay ---------------------------------------------------------------
  const sync = useCallback(async (): Promise<void> => {
    if (syncing.current || !isOfflineStoreAvailable()) return
    const queue = await readOutbox()
    const pending = queue.filter((q) => q.status !== "failed")
    if (pending.length === 0) return

    syncing.current = true
    setState((s) => ({ ...s, syncing: true }))

    try {
      for (const entry of pending) {
        try {
          await markSending(entry.key)
          const result = await recordPosSale(entry.payload)
          if (result.success) {
            // Covers a replay too: the server returns the original receipt
            // for a key it has already seen, which is a success here.
            await dequeueSale(entry.key)
            setState((s) => ({ ...s, connection: "online" }))
          } else {
            await markFailed(entry.key, result.error)
            setState((s) => ({ ...s, connection: "online" }))
          }
        } catch {
          // Unreachable. Stop the whole run rather than hammering the rest:
          // if one could not be sent, none of them can, and every extra
          // attempt is a timeout the cashier waits through.
          setState((s) => ({ ...s, connection: "offline" }))
          break
        }
      }
    } finally {
      syncing.current = false
      setState((s) => ({ ...s, syncing: false }))
      await refreshQueue()
    }
  }, [refreshQueue])

  // --- notice a reconnection -----------------------------------------------
  useEffect(() => {
    const onOnline = () => { setState((s) => ({ ...s, connection: "checking" })); void sync() }
    const onOffline = () => setState((s) => ({ ...s, connection: "offline" }))
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setState((s) => ({ ...s, connection: "offline" }))
    }
    // A slow poll as well as the events, because the events do not fire for
    // the failure that matters most: a connection that is "up" but cannot
    // reach the server.
    const id = setInterval(() => { void sync() }, 30000)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      clearInterval(id)
    }
  }, [sync])

  /**
   * Try the server; queue it if the server cannot be reached.
   *
   * Returns the receipt when it went through, or `queued` when it did not.
   * The caller still shows a receipt in the queued case — the customer is
   * standing there and the sale did happen; what changes is the wording.
   */
  const submitSale = useCallback(
    async (
      payload: { idempotencyKey: string } & Record<string, unknown>,
      summary: { total: number; itemCount: number },
    ): Promise<{ ok: true; receipt: Receipt } | { ok: false; queued: true } | { ok: false; queued: false; error: string }> => {
      try {
        const result = await recordPosSale(payload)
        setState((s) => ({ ...s, connection: "online" }))
        if (result.success) return { ok: true, receipt: result.data }
        // Reached, and refused. Not a queueing situation: queueing it would
        // just fail again, and the cashier needs to know now.
        return { ok: false, queued: false, error: result.error }
      } catch {
        setState((s) => ({ ...s, connection: "offline" }))
        if (!isOfflineStoreAvailable()) {
          return {
            ok: false,
            queued: false,
            error: "No connection, and this device cannot hold sales until it is back. Nothing was recorded.",
          }
        }
        try {
          await enqueueSale({
            key: payload.idempotencyKey,
            payload,
            summary: { ...summary, occurredAt: new Date().toISOString() },
          })
          await refreshQueue()
          return { ok: false, queued: true }
        } catch {
          return {
            ok: false,
            queued: false,
            error: "No connection, and the sale could not be saved on this device. Write it down.",
          }
        }
      }
    },
    [refreshQueue],
  )

  const saveCatalogue = useCallback(async (products: CachedProduct[]) => {
    if (!isOfflineStoreAvailable() || products.length === 0) return
    try {
      await cacheCatalogue(products)
      setState((s) => ({ ...s, catalogue: products, catalogueUpdatedAt: new Date().toISOString() }))
    } catch {
      // Caching is an optimisation; failing to cache must never fail a sale.
    }
  }, [])

  const retry = useCallback(async (key: string) => { await retrySale(key); await refreshQueue(); void sync() }, [refreshQueue, sync])
  const discard = useCallback(async (key: string) => { await discardSale(key); await refreshQueue() }, [refreshQueue])

  return { ...state, sync, submitSale, saveCatalogue, retry, discard, refreshQueue }
}
