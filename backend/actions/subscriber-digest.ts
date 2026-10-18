"use server"

import { runWeeklySubscriberDigest } from "@/backend/services/subscriber-digest-core"

import { db } from "@/backend/db"
import { publicProductWhere } from "@/backend/domain/public-catalog"
import { sendEmail } from "@/backend/services/email"
import { wrapEmailLayout, escapeEmailText, emailButton, siteOrigin, emailBrand } from "@/backend/services/email-templates"

const SETTING_KEY = "lastSubscriberDigestAt"

async function getLastDigestAt(): Promise<Date> {
  const setting = await db.platformSetting.findUnique({ where: { key: SETTING_KEY } })
  if (setting && typeof setting.value === "string") return new Date(setting.value)
  // First-ever run: cover the past 7 days rather than the whole platform
  // history, same "anchor a sensible window, don't dump everything" choice
  // the per-user weekly digest already makes.
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
}

async function setLastDigestAt(at: Date): Promise<void> {
  await db.platformSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: at.toISOString() },
    create: { key: SETTING_KEY, value: at.toISOString() },
  })
}

type DigestProduct = {
  id: string
  name: string
  price: number
  discountPrice: number | null
  shopName: string
  badge: "New" | "Back in Stock" | "Trending"
  image: string | null
}

const BADGE_STYLE: Record<DigestProduct["badge"], string> = {
  New: "background:#d1fae5;color:#059669;",
  "Back in Stock": "background:#dbeafe;color:#2563eb;",
  Trending: "background:#fef3c7;color:#b45309;",
}

function priceHtml(p: DigestProduct): string {
  if (p.discountPrice != null && p.discountPrice < p.price) {
    const pct = Math.round((1 - p.discountPrice / p.price) * 100)
    return `<span style="color:${emailBrand.gold};font-weight:700;">KES ${p.discountPrice.toLocaleString()}</span> <span style="color:#9ca3af;text-decoration:line-through;font-size:12px;">KES ${p.price.toLocaleString()}</span> <span style="display:inline-block;background:${emailBrand.gold};color:${emailBrand.goldText};font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:2px;">-${pct}%</span>`
  }
  return `<span style="font-weight:700;color:#ffffff;">KES ${p.price.toLocaleString()}</span>`
}

// Product photos in this app are stored as inline base64 data URIs (no
// object storage), and some run into multiple megabytes as a string — one
// oversized photo could bloat the whole email. This caps any single image
// at ~110KB of raw bytes (150,000 base64 chars) before it's allowed inline;
// anything bigger silently falls back to the initial-letter placeholder
// below rather than dragging the rest of the email down with it.
const MAX_INLINE_IMAGE_CHARS = 150_000

function safeImage(image: string | null): string | null {
  if (!image || !image.startsWith("data:image")) return null
  if (image.length > MAX_INLINE_IMAGE_CHARS) return null
  return image
}

function productCardHtml(p: DigestProduct, origin: string): string {
  const productUrl = `${origin}/customer/products/${p.id}`
  const image = safeImage(p.image)
  const imageHtml = image
    ? `<img src="${image}" width="260" height="150" alt="${escapeEmailText(p.name)}" style="display:block;width:100%;height:150px;object-fit:cover;background:#f3f4f6;" />`
    : `<div style="width:100%;height:150px;background:#f3f4f6;text-align:center;line-height:150px;">
        <span style="font-size:34px;font-weight:800;color:#9ca3af;">${escapeEmailText(p.name.charAt(0).toUpperCase())}</span>
      </div>`

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
      <tr><td style="height:150px;">${imageHtml}</td></tr>
      <tr>
        <td style="background:${emailBrand.dark};padding:12px 14px;">
          <span style="display:inline-block;font-size:10px;font-weight:700;letter-spacing:0.02em;padding:2px 9px;border-radius:999px;margin-bottom:6px;${BADGE_STYLE[p.badge]}">${p.badge.toUpperCase()}</span>
          <div style="font-weight:600;color:#ffffff;font-size:14px;margin:2px 0;">${escapeEmailText(p.name)}</div>
          <div style="color:#93a5c9;font-size:12px;margin-bottom:10px;">${escapeEmailText(p.shopName)}</div>
          <div style="margin-bottom:12px;">${priceHtml(p)}</div>
          <a href="${productUrl}" style="display:inline-block;background:${emailBrand.gold};color:${emailBrand.goldText};padding:8px 14px;text-decoration:none;border-radius:6px;font-weight:700;font-size:12px;">Shop Now</a>
        </td>
      </tr>
    </table>
  `
}

// Grid caps at 6 cards per section (3 rows of 2) — enough to feel like a
// real catalog spread without letting a big section's image weight (up to
// ~110KB each, uncapped in count) push the total email size too high.
// Anything past the cap is still real, just linked as a "+N more" instead
// of embedded.
const GRID_CAP = 6

function sectionHtml(heading: string, products: DigestProduct[], origin: string): string {
  if (products.length === 0) return ""
  const shown = products.slice(0, GRID_CAP)
  const overflow = products.length - shown.length

  const rows: string[] = []
  for (let i = 0; i < shown.length; i += 2) {
    const pair = shown.slice(i, i + 2)
    rows.push(`
      <tr>
        <td width="50%" style="padding:6px;vertical-align:top;">${productCardHtml(pair[0], origin)}</td>
        <td width="50%" style="padding:6px;vertical-align:top;">${pair[1] ? productCardHtml(pair[1], origin) : ""}</td>
      </tr>
    `)
  }

  return `
    <h2>${heading}</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:4px;">${rows.join("")}</table>
    ${overflow > 0 ? `<p style="color:#6b7280;font-size:13px;margin:4px 0 8px;">+${overflow} more, <a href="${origin}/customer/products" style="color:${emailBrand.accent};">view all</a></p>` : ""}
  `
}

function buildDigestHtml(sections: { newProducts: DigestProduct[]; restocked: DigestProduct[]; trending: DigestProduct[] }, unsubscribeToken: string): string {
  const origin = siteOrigin()
  const body = `
    <p>Here's what's happening on SAJI this week.</p>
    ${sectionHtml("New This Week", sections.newProducts, origin)}
    ${sectionHtml("Back in Stock", sections.restocked, origin)}
    ${sectionHtml("Trending Now", sections.trending, origin)}
    <p style="margin-top:24px;text-align:center;">${emailButton("View All Products", `${origin}/customer/products`)}</p>
  `
  return wrapEmailLayout({
    title: "What's new on SAJI",
    bodyHtml: body,
    unsubscribeUrl: `${origin}/api/subscribers/unsubscribe?token=${unsubscribeToken}`,
  })
}

export type SubscriberDigestResult = {
  subscribersConsidered: number
  emailsSent: number
  emailsFailed: number
  emailsUnconfigured: number
  newProductCount: number
  restockedProductCount: number
  trendingProductCount: number
}

/** Entry point for the weekly subscriber-digest cron. Unlike the per-user
 * digest (lib/actions/email-digest.ts), every subscriber gets the exact
 * same content, so the "since" window is tracked once globally via
 * PlatformSetting rather than per-row. Skips sending entirely if nothing
 * genuinely new/restocked happened — an empty "nothing happened" email is
 * exactly the kind of noise a newsletter shouldn't send. The "Trending Now"
 * section is only ever bonus content riding along on a real new/restocked
 * week, not a reason to send on its own — otherwise every single week would
 * always have "something" to send (there's almost always a top-rated
 * product), which defeats the point of the gate. */

