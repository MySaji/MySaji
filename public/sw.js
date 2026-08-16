// Real Web Push service worker — receives a push event from the browser's
// push service and shows an actual OS-level notification. Kept deliberately
// minimal (no offline caching/PWA shell logic) since push is the only thing
// this app currently needs a service worker for.

self.addEventListener("push", (event) => {
  let data = { title: "SAJI", body: "You have a new notification.", url: "/" }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // ignore malformed payloads
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url || "/" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === url && "focus" in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
