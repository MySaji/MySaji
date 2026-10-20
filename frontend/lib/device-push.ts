"use client"

import { savePushSubscription, removePushSubscription } from "@/backend/actions/push"

export function supportsDevicePush() {
  return typeof window !== "undefined" && window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window
}

export async function rootPushWorker() {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
  if (!registration.active) await new Promise<void>((resolve, reject) => {
    const worker = registration.installing || registration.waiting
    if (!worker) { reject(new Error("Notification service is not ready. Try again.")); return }
    const timeout = setTimeout(() => reject(new Error("Notification service took too long. Try again.")), 12000)
    worker.addEventListener("statechange", () => { if (worker.state === "activated") { clearTimeout(timeout); resolve() } })
    if (worker.state === "activated") { clearTimeout(timeout); resolve() }
  })
  return registration
}

export async function enableDevicePush(publicKey: string) {
  if (!supportsDevicePush()) throw new Error("Device alerts need HTTPS and a browser that supports Web Push. On iPhone or iPad, open MySaji from its Home Screen icon.")
  if (!publicKey) throw new Error("Device notifications are not configured on this deployment.")
  // Request synchronously from the button gesture, before any network await.
  const permission = await Notification.requestPermission()
  if (permission !== "granted") throw new Error("Notifications are blocked. Allow them in your browser's site settings, then try again.")
  const registration = await rootPushWorker()
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - publicKey.length % 4) % 4)), c => c.charCodeAt(0))
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  const result = await savePushSubscription(subscription.toJSON())
  if (!result.success) throw new Error(result.error)
  window.dispatchEvent(new Event("saji:push-updated"))
  return registration
}

export async function disableDevicePush() {
  if (!("serviceWorker" in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration("/")
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    const result = await removePushSubscription({ endpoint: subscription.endpoint })
    if (!result.success) throw new Error(result.error)
    await subscription.unsubscribe()
  }
  window.dispatchEvent(new Event("saji:push-updated"))
}

export async function clearDevicePushSession() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration("/")
  registration?.active?.postMessage({ type: "SAJI_PUSH_SESSION", session: null })
  const notifications = await registration?.getNotifications().catch(() => [])
  notifications?.forEach(notification => notification.close())
  // Invalidate browser delivery immediately, even if the server cannot be reached.
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) {
    await subscription.unsubscribe().catch(() => false)
    await removePushSubscription({ endpoint: subscription.endpoint }).catch(() => {})
  }
}
