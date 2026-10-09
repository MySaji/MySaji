/**
 * The till's service worker.
 *
 * WHERE THIS FILE LIVES IS THE POINT, and it took two goes to get right.
 *
 * A service worker can only claim a scope at or below its own directory.
 * Putting it at /till-sw.js would give it scope "/", where it would replace
 * the push worker the notification settings card registers and quietly break
 * notifications across the whole app. So not that.
 *
 * But /provider/till/sw.js was also wrong: that claims "/provider/till/",
 * and the till page is at "/provider/till" with NO trailing slash, which is
 * outside that scope. The page would have been uncontrolled, and an
 * uncontrolled start_url is not installable — the install offer would simply
 * never have appeared, with nothing to show why.
 *
 * Hence /provider/sw.js, claiming "/provider/". That is wider than the till,
 * which is only acceptable because this worker does nothing: see below.
 *
 * WHAT IT DOES NOT DO: cache anything.
 *
 * That is deliberate and it is not laziness. A till serving a stale cached
 * price is worse than a till that will not load — the cashier charges
 * yesterday's price and nobody finds out until the stock count disagrees. An
 * offline till needs a real local catalogue, a durable outbox and conflict
 * handling, which is its own piece of work; a naive cache-first worker would
 * look like offline support while silently corrupting takings.
 *
 * So the fetch handler below passes everything straight through. Its only
 * job is to exist: Chrome requires a service worker with a fetch handler
 * before it will offer to install a page to the home screen or desktop, and
 * installability is what makes the till a tool of its own rather than a
 * browser tab. When the offline phase lands, this is the file it lands in.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every till tab to close.
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("fetch", (event) => {
  // Pass-through. See the note above before adding caching here.
  event.respondWith(fetch(event.request))
})
