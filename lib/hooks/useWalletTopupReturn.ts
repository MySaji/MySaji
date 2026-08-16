"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { capturePaypalOrder } from "@/lib/actions/payments"
import { getWalletTopupIdByExternalRef, checkWalletTopupStatus } from "@/lib/actions/wallet"

export type WalletTopupReturnMessage = { type: "success" | "error"; text: string } | null

/** Handles the redirect back from PayPal/Stripe after a wallet top-up
 * checkout — originally inline in customer-wallet-page.tsx; extracted so
 * the shopkeeper earnings page's own "Add Money" flow (funding distributor
 * orders) doesn't have to duplicate the same capture/poll logic. */
export function useWalletTopupReturn(opts: {
  returnPath: string
  onSettled: () => void
  messages: { paypalSuccess: string; paypalFailed: string; cardSuccess: string; cardUnconfirmed: string }
}): WalletTopupReturnMessage {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [returnMessage, setReturnMessage] = useState<WalletTopupReturnMessage>(null)

  useEffect(() => {
    const paypalFlag = searchParams.get("paypal")
    const orderId = searchParams.get("token")
    const stripeFlag = searchParams.get("stripe")
    const sessionId = searchParams.get("session_id")

    if (paypalFlag === "return" && orderId) {
      capturePaypalOrder(orderId).then((result) => {
        setReturnMessage({ type: result.success ? "success" : "error", text: result.success ? opts.messages.paypalSuccess : (result.message ?? opts.messages.paypalFailed) })
        opts.onSettled()
        router.replace(opts.returnPath)
      })
    } else if (stripeFlag === "success" && sessionId) {
      getWalletTopupIdByExternalRef(sessionId).then(async (paymentId) => {
        if (!paymentId) return
        const status = await checkWalletTopupStatus(paymentId)
        setReturnMessage({ type: status?.status === "COMPLETED" ? "success" : "error", text: status?.status === "COMPLETED" ? opts.messages.cardSuccess : opts.messages.cardUnconfirmed })
        opts.onSettled()
        router.replace(opts.returnPath)
      })
    } else if (stripeFlag === "cancel" || paypalFlag === "cancel") {
      router.replace(opts.returnPath)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return returnMessage
}
