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
 * At /pos/sw.js it claims "/pos/", which covers every screen of the POS
 * including the sell screen at /pos/sell.
 *
 * This used to be harder. The POS lived at /provider/till, a path with no
 * trailing slash, so a worker at /provider/till/sw.js claimed
 * "/provider/till/" and did NOT cover the page itself: it was uncontrolled,
 * an uncontrolled start_url is not installable, and the install offer simply
 * never appeared with nothing to show why. The worker had to sit a level up
 * at /provider/sw.js. Moving the POS to its own /pos/ tree removed the
 * problem rather than working around it.
 *
 * WHAT IT CACHES, AND WHAT IT MUST NOT
 *
 * The danger with a till is a stale PRICE: a cashier charging yesterday's
 * figure, with nobody finding out until the stock count disagrees. So the
 * rule here is that this worker caches the SHELL and never the DATA.
 *
 *   the app shell (HTML)     network first, cache only as a fallback
 *   /_next/static/*          cache first, because those URLs are content
 *                            hashed, so a changed file is a new URL and a
 *                            cached one can never be stale
 *   everything else, and
 *   every non-GET request    straight to the network, never stored
 *
 * Prices and stock do not come through here at all. They live in IndexedDB,
 * written by the till itself after a successful load, and the till already
 * labels that catalogue as last known and shows the connection state above
 * it. That is where "is this figure current" gets answered, and it stays
 * there. This file only makes sure the page can open at all.
 *
 * Server actions are POSTs. They are deliberately NOT intercepted: when the
 * line is down they must fail, so the outbox in the page catches them and
 * queues the sale. A worker that quietly answered them would swallow sales.
 */

// Bump to retire every previous cache. The activate handler deletes any
// cache whose name is not this one, so a stale shell cannot outlive a
// deploy.
const CACHE = "saji-till-shell-v2"

// The shell, fetched at install so the first cold start offline works even
// if the cashier has not opened that exact page since installing.
const SHELL = ["/pos/sell"]

/**
 * Cache the shell, and whatever the shell says it needs.
 *
 * The asset URLs are content hashed, so this file cannot know them: they
 * change with every build. So it reads them out of the HTML it just fetched.
 *
 * This matters more than it looks. A worker only sees fetches it controls,
 * and it controls nothing on the load during which it was registered. Left
 * to pick assets up as they pass, a till installed and taken offline the
 * same morning would have the page cached and none of the JavaScript that
 * makes it a till, which is worse than failing outright: the cashier gets a
 * page that looks half alive.
 */
async function precache(cache, url) {
  let res
  try {
    res = await fetch(url, { credentials: "same-origin" })
  } catch {
    return
  }
  if (!res || !res.ok) return

  const html = await res.clone().text()
  await cache.put(url, res)

  // Every build asset the document references. Script src, stylesheet href
  // and preload href all appear as plain quoted paths in the markup.
  const assets = new Set()
  const re = /["'(](\/_next\/[^"')\s]+)["')]/g
  let m
  while ((m = re.exec(html)) !== null) {
    const a = m[1].replace(/&amp;/g, "&")
    // Only immutable output. A dev server's hot update endpoints are not.
    if (a.includes("/static/") || a.endsWith(".js") || a.endsWith(".css")) assets.add(a)
  }

  await Promise.all(
    [...assets].map((a) =>
      fetch(a, { credentials: "same-origin" })
        .then((r) => (r.ok ? cache.put(a, r) : null))
        .catch(() => null),
    ),
  )
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, and tolerant: one unreachable URL must not abandon
      // the whole install and leave the till with no shell at all.
      .then((cache) => Promise.all(SHELL.map((url) => precache(cache, url))))
      // Take over immediately rather than waiting for every till tab to close.
      .then(() => self.skipWaiting()),
  )
})

// Re-run the sweep when the page asks, which it does once it has loaded.
// By then the worker is controlling and the document is the current build,
// so anything the install pass could not see gets picked up.
self.addEventListener("message", (event) => {
  if (event.data !== "precache") return
  event.waitUntil(
    caches.open(CACHE).then((cache) => Promise.all(SHELL.map((url) => precache(cache, url)))),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("saji-till-shell-") && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request

  // Only GET is ever cacheable. Everything else, every server action and
  // every sale, goes to the network untouched and is allowed to fail.
  if (req.method !== "GET") return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Immutable build output: content hashed, so a hit can never be stale.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // The page itself. Network first, so an online cashier always gets the
  // current build; the cache answers only when the network does not.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() =>
          caches.match(req).then(
            (hit) =>
              hit ||
              // Not this exact URL, but the till shell will do: it boots,
              // reads its catalogue from IndexedDB and says it is offline.
              caches.match("/pos/sell").then(
                (shell) =>
                  shell ||
                  new Response(
                    "<!doctype html><meta charset=utf-8><title>Till</title>" +
                      "<body style=\"font-family:system-ui;padding:2rem;text-align:center\">" +
                      "<h1 style=\"font-size:1.1rem\">The till cannot open</h1>" +
                      "<p style=\"color:#666;font-size:.9rem;line-height:1.5\">There is no connection and this device has not " +
                      "saved the till yet. Connect once, and it will open without one after that.</p>",
                    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
                  ),
              ),
          ),
        ),
    )
    return
  }

  // Data, images, everything else: straight through, never stored. Stock and
  // prices must never be answered from here.
})
