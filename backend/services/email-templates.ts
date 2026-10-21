// Served by the app itself (public/email-logo.png), copied unchanged from the former
// Supabase Storage object so emails no longer depend on Supabase.
const LOGO_PATH = "/email-logo.png"
const BRAND_DARK = "#0647b5"
const BRAND_ACCENT = "#0647b5"
const BRAND_GOLD = "#ff8a17"
const BRAND_GOLD_TEXT = "#172b4d"

export function escapeEmailText(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!)
}

function emailUrl(value: string): string {
  try { const url = new URL(value); return ["https:", "http:", "mailto:"].includes(url.protocol) ? escapeEmailText(url.href) : "#" } catch { return "#" }
}

/** Shared, table-based email shell. Critical styles are inline for Outlook and Gmail. */
export function wrapEmailLayout(opts: { title: string; bodyHtml: string; unsubscribeUrl?: string; previewText?: string }): string {
  const title = escapeEmailText(opts.title)
  const preview = escapeEmailText(opts.previewText || opts.title)
  const origin = emailUrl(siteOrigin())
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${title}</title>
<style>body{margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172b4d}table{border-collapse:collapse}a{color:#0647b5}.content p{font-size:15px;line-height:1.8;color:#596b84;margin:0 0 18px}.content h2{font-size:22px;line-height:1.35;color:#172b4d;margin:0 0 18px}.content li{font-size:14px;line-height:1.8;color:#596b84}.button{display:inline-block;background:#ff8a17;color:#172b4d!important;padding:13px 22px;border-radius:7px;text-decoration:none;font-weight:700;font-size:14px}@media(max-width:620px){.outer{padding:16px 10px!important}.content{padding:26px 22px!important}.brand-header{padding:23px 22px!important}.email-title{font-size:25px!important}.email-footer{padding:22px!important}}</style></head>
<body data-saji-email="true" style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#172b4d;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;mso-hide:all;">${preview}</div>
<table role="presentation" width="100%" style="width:100%;background:#f3f6fb;"><tr><td class="outer" align="center" style="padding:35px 16px;">
<table role="presentation" width="600" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e0e8f4;">
<tr><td class="brand-header" style="padding:27px 36px;background:#0647b5;border-bottom:4px solid #ff8a17;"><table role="presentation"><tr><td style="padding-right:12px;vertical-align:middle;"><img src="${origin.replace(/\/$/, "")}${LOGO_PATH}" width="43" height="43" alt="MySaji" style="display:block;border:0;border-radius:9px;"></td><td style="vertical-align:middle;"><a href="${origin}" style="font-size:25px;letter-spacing:-1px;font-weight:700;color:#ffffff;text-decoration:none;">MySaji</a><div style="color:#c8dcff;font-size:10px;letter-spacing:1px;line-height:1.8;">SHOP &middot; WORK &middot; RENT &middot; LEARN &middot; GROW</div></td></tr></table></td></tr>
<tr><td class="content" style="padding:34px 36px;font-size:15px;line-height:1.8;color:#596b84;"><p style="margin:0 0 10px;font-size:10px;letter-spacing:1.8px;color:#8a9ab0;font-weight:700;">YOUR MYSAJI UPDATE</p><h1 class="email-title" style="margin:0 0 25px;font-size:29px;line-height:1.25;letter-spacing:-.7px;font-weight:700;color:#172b4d;">${title}</h1>${opts.bodyHtml}</td></tr>
<tr><td style="padding:0 36px;"><div style="border-top:1px solid #e2e9f3;"></div></td></tr>
<tr><td class="email-footer" style="padding:23px 36px 29px;font-size:12px;line-height:1.8;color:#8492a7;"><p style="margin:0 0 10px;">Need a hand? <a href="${origin}/knowledge/support" style="color:#0647b5;text-decoration:underline;">Visit the help centre</a>.</p><p style="margin:0 0 12px;">Keep your verification codes and passwords private. MySaji will never need you to share them in a chat.</p>${opts.unsubscribeUrl ? `<p style="margin:0 0 12px;"><a href="${emailUrl(opts.unsubscribeUrl)}" style="color:#0647b5;">Unsubscribe from these emails</a></p>` : ""}<p style="margin:0;color:#9aa6b8;font-size:11px;">&copy; ${new Date().getFullYear()} MySaji. This message was sent automatically.</p></td></tr>
</table></td></tr></table></body></html>`
}

export function emailButton(label: string, url: string): string {
  return `<a href="${emailUrl(url)}" class="button" style="display:inline-block;background-color:${BRAND_GOLD};color:${BRAND_GOLD_TEXT};padding:13px 22px;text-decoration:none;border-radius:7px;font-weight:700;font-size:14px;line-height:1.6;">${escapeEmailText(label)}</a>`
}
export const emailBrand = { dark: BRAND_DARK, accent: BRAND_ACCENT, gold: BRAND_GOLD, goldText: BRAND_GOLD_TEXT }

export function otpCodeBlock(code: string): string {
  return `<table role="presentation" width="100%" style="width:100%;margin:24px 0;border:1px solid #d3e2fa;background:#f2f7ff;"><tr><td align="center" style="padding:23px 10px;"><p style="font-size:10px;letter-spacing:1.5px;color:#7188ac;margin:0 0 8px;">YOUR VERIFICATION CODE</p><div style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:6px;white-space:nowrap;color:#0647b5;">${escapeEmailText(code)}</div></td></tr></table>`
}

export function siteOrigin(): string {
  return (process.env.EMAIL_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || process.env.CALLBACK_URL || "https://mysaji.com").replace(/\/+$/, "")
}
