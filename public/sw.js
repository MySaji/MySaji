// Push-only worker: never caches authenticated pages or application chunks.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()))

function deviceSession(write, value) {
  return new Promise(resolve => {
    const request = indexedDB.open("saji-device-push", 1)
    request.onupgradeneeded = () => request.result.createObjectStore("session")
    request.onerror = () => resolve(null)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction("session", write ? "readwrite" : "readonly")
      const store = tx.objectStore("session")
      const operation = write ? store.put(value, "current") : store.get("current")
      let result = null
      operation.onsuccess = () => { result = write ? value : operation.result }
      tx.oncomplete = () => { db.close(); resolve(result) }
      tx.onerror = () => { db.close(); resolve(null) }
    }
  })
}

function safeDestination(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin)
    return url.origin === self.location.origin && ["http:", "https:"].includes(url.protocol) ? url.href : self.location.origin + "/"
  } catch { return self.location.origin + "/" }
}

self.addEventListener("message", event => {
  if (event.data?.type === "SAJI_PUSH_SESSION") event.waitUntil(deviceSession(true, event.data.session || null))
})

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data
    try { data = event.data?.json() } catch { return }
    const session = await deviceSession(false)
    if (!session?.userId || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() || data?.recipientId !== session.userId) return
    await self.registration.showNotification(typeof data.title === "string" ? data.title : "MySaji", {
      body: typeof data.body === "string" ? data.body : "You have an update.",
      icon: "/icon-192.png", badge: "/icon-192.png", tag: data.tag,
      silent: false, data: { url: safeDestination(data.url) },
    })
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    windows.forEach(client => client.postMessage({ type: "SAJI_PUSH_SHOWN" }))
  })())
})

self.addEventListener("notificationclick", event => {
  event.notification.close()
  const url = safeDestination(event.notification.data?.url)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    const exact = windows.find(client => client.url === url)
    if (exact) return exact.focus()
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin && !new URL(client.url).pathname.startsWith("/pos"))
    if (existing && "navigate" in existing) { await existing.navigate(url); return existing.focus() }
    return self.clients.openWindow(url)
  })())
})
