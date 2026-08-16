"use client"

import useSWR, { mutate } from "swr"
import { getCartCount } from "@/lib/actions/cart"

const CART_COUNT_KEY = "cart-count"
const CART_POLL_MS = 15000

/** Shared across every page that shows a cart badge (currently just the
 * header icon in app/customer/layout.tsx) — SWR's global cache means a
 * single `revalidateCartCount()` call from any add/update/remove call site
 * updates every mounted consumer instantly, not just the page that made
 * the change. */
export function useCartCount() {
  const { data } = useSWR(CART_COUNT_KEY, getCartCount, { refreshInterval: CART_POLL_MS, revalidateOnFocus: true })
  return data ?? 0
}

export function revalidateCartCount() {
  return mutate(CART_COUNT_KEY)
}
