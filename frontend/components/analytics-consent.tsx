"use client"
import Script from "next/script"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { consentKey, isTrackedPath } from "@/frontend/lib/analytics"

export function AnalyticsConsent() {
  const pathname = usePathname()
  const [consent, setConsent] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [cleanUrl, setCleanUrl] = useState(false)
  const lastPage = useRef<string | null>(null)
  const loaded = useRef(false)
  const container = process.env.NEXT_PUBLIC_GTM_ID || ""
  const configured = /^GTM-[A-Z0-9]+$/.test(container)
  const publicPage = isTrackedPath(pathname)
  useEffect(() => { setCleanUrl(!location.search && !location.hash); try { setConsent(localStorage.getItem(consentKey)) } catch { /* Fail closed. */ } }, [])
  useEffect(() => {
    if (loaded.current && !publicPage) { window.location.reload(); return }
    if (!publicPage || consent !== "granted" || !ready || lastPage.current === pathname) return
    lastPage.current = pathname
    window.dataLayer?.push({ event: "mysaji_page_view", page_path: pathname,
      page_location: `${location.origin}${pathname}`, page_title: pathname === "/" ? "MySaji" : "MySaji knowledge" })
  }, [pathname, publicPage, consent, ready])
  // Discard the tracked document when links leave approved public URLs.
  useEffect(() => {
    if (!ready) return
    function leave(event: MouseEvent) {
      const anchor = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || anchor.target === "_blank") return
      const url = new URL(anchor.href)
      if (url.origin === location.origin && (!isTrackedPath(url.pathname) || url.search || url.hash)) { event.preventDefault(); event.stopPropagation(); location.assign(url.href) }
    }
    document.addEventListener("click", leave, true)
    return () => document.removeEventListener("click", leave, true)
  }, [ready])
  function choose(value: string) {
    try { localStorage.setItem(consentKey, value) } catch { return }
    // Reload discards existing container, recordings and queued events on withdrawal.
    location.reload()
  }
  if (!configured || !publicPage || !cleanUrl) return null
  return <>
    {consent === "granted" && <Script id="mysaji-gtm" strategy="afterInteractive" onReady={() => { loaded.current = true; setReady(true) }} dangerouslySetInnerHTML={{ __html: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
      gtag('set','ads_data_redaction',true);
      gtag('set','url_passthrough',false);
      gtag('consent','update',{analytics_storage:'granted'});
      dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
      var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtm.js?id=${container}';document.head.appendChild(s);
    ` }} />}
    <aside aria-label="Analytics privacy preferences" className="fixed bottom-3 left-3 right-3 z-50 max-w-xl rounded-xl border bg-background p-4 text-foreground shadow-lg">
      {consent === null && <p className="mb-3 text-sm">Allow optional analytics on public guides to help improve MySaji? Advertising storage stays disabled. <a href="/privacy" className="underline">Privacy policy</a></p>}
      <div className="flex flex-wrap gap-3">
        {consent !== "granted" && <button type="button" className="rounded border px-3 py-2" onClick={() => choose("granted")}>Allow analytics</button>}
        {consent !== "denied" && <button type="button" className="rounded border px-3 py-2" onClick={() => choose("denied")}>{consent === "granted" ? "Withdraw analytics consent" : "Reject analytics"}</button>}
      </div>
    </aside>
  </>
}
