// Shared branded HTML shell for every subscriber-facing email (welcome
// confirmation, the weekly product digest, and admin one-off newsletters) so
// they all look like they come from the same product rather than each
// route hand-rolling its own layout. Styling is duplicated as both a
// `<style>` block AND inline `style=` attributes on anything load-bearing
// (buttons, in particular) — some webmail clients (notably older Outlook)
// strip `<style>` blocks entirely, and a CTA button with no inline fallback
// would render as unstyled plain text.
//
// Colors are the app's real theme tokens (app/globals.css --primary/
// --accent-warm), hard-coded as hex here rather than referencing oklch() —
// email clients (Outlook chief among them) don't support the oklch() CSS
// function at all, so this is the deliberate hex fallback, not a drift.

// The logo went through three attempts before landing here: a base64
// data: URI rendered fine in a browser but Gmail (and several other major
// clients) strip data: URIs from HTML email outright, as a phishing-
// prevention measure. A CID (Content-ID) attachment fixed that, but
// Gmail's inbox *list view* surfaces any CID-embedded image as a visible
// attachment chip regardless of contentDisposition. A plain remote
// <img src> pointed at this app's own CALLBACK_URL (the ngrok dev tunnel)
// worked structurally but is only reachable while that tunnel happens to
// be running — real emails need to render correctly days or weeks later,
// long after any dev session ended.
//
// This is a real Supabase Storage object instead — a public bucket
// ("email-assets") on the same Supabase project this app's database
// already lives in, uploaded once via the Storage REST API (not something
// re-uploaded on every email send). It's reachable independent of this
// dev machine, any tunnel, or whether the app is even running, which is
// what a logo baked into already-sent emails actually needs.
const LOGO_URL = "https://liyntcmcakllwcydrfzs.supabase.co/storage/v1/object/public/email-assets/logo.png"

const BRAND_DARK = "#1e3a8a" // --primary, matches Tailwind blue-900
const BRAND_DARK_2 = "#1d4ed8" // blue-700, header gradient's lighter end
const BRAND_HEADER_GRADIENT = `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_DARK_2} 100%)`
const BRAND_ACCENT = "#2563eb" // --accent, used for links/footer accents
const BRAND_GOLD = "#f59e0b" // --accent-warm, the CTA button color
const BRAND_GOLD_TEXT = "#1f2937" // --accent-warm-foreground

export function wrapEmailLayout(opts: { title: string; bodyHtml: string; unsubscribeUrl?: string }): string {
  const { title, bodyHtml, unsubscribeUrl } = opts
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f3f4f6; }
          .container { max-width: 600px; margin: 0 auto; background-color: #f9fafb; }
          .header { background: ${BRAND_HEADER_GRADIENT}; color: white; padding: 28px 20px; text-align: center; }
          .header h1 { margin: 14px 0 0; font-size: 21px; }
          .content { background: white; padding: 32px 40px; }
          .content h2 { color: #1f2937; font-size: 19px; margin-top: 0; }
          .content p { margin: 0 0 16px 0; color: #4b5563; }
          .button { display: inline-block; background-color: ${BRAND_GOLD}; color: ${BRAND_GOLD_TEXT} !important; padding: 11px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; }
          .divider { border-top: 1px solid #e5e7eb; margin: 0; }
          .footer { background-color: #f3f4f6; padding: 20px 40px; text-align: center; font-size: 12px; color: #6b7280; }
          .footer a { color: ${BRAND_ACCENT}; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <table role="presentation" align="center" style="margin:0 auto;border-collapse:collapse;">
              <tr>
                <td style="vertical-align:middle;padding-right:10px;">
                  <img src="${LOGO_URL}" width="36" height="36" alt="SAJI" style="display:block;border-radius:8px;" />
                </td>
                <td style="vertical-align:middle;">
                  <span style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:0.4px;">SAJI</span>
                </td>
              </tr>
            </table>
            <h1>${title}</h1>
          </div>
          <div class="content">${bodyHtml}</div>
          <div class="divider"></div>
          <div class="footer">
            <p>This is an automated email from SAJI Marketplace.</p>
            ${unsubscribeUrl ? `<p><a href="${unsubscribeUrl}" style="color:${BRAND_ACCENT};text-decoration:none;">Unsubscribe</a> from these emails.</p>` : ""}
            <p>&copy; ${new Date().getFullYear()} SAJI. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `
}

export function emailButton(label: string, url: string): string {
  return `<a href="${url}" class="button" style="display:inline-block;background-color:${BRAND_GOLD};color:${BRAND_GOLD_TEXT};padding:11px 24px;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">${label}</a>`
}

// Exposed for callers building their own on-brand HTML fragments (e.g. the
// product-grid cards in the subscriber digest) instead of duplicating these
// hex values in a second place.
export const emailBrand = { dark: BRAND_DARK, accent: BRAND_ACCENT, gold: BRAND_GOLD, goldText: BRAND_GOLD_TEXT }

/** Large, unmistakable code display for OTP/verification emails — dashed
 * brand-colored box with wide letter-spacing, tuned so all 6 digits stay
 * readable (and don't wrap) even at the narrow width Gmail/Outlook mobile
 * clients render emails at. */
export function otpCodeBlock(code: string): string {
  return `
    <div style="background:#f3f4f6;border:2px dashed ${BRAND_ACCENT};border-radius:10px;padding:22px 12px;text-align:center;margin:22px 0;">
      <div style="font-family:'Courier New',monospace;font-size:34px;font-weight:800;letter-spacing:8px;color:#1f2937;">${code}</div>
    </div>
  `
}

/** Absolute site origin for links inside emails — email clients can't
 * resolve relative URLs the way a browser can. Same env var the payment
 * flows already use for their own redirect/callback URLs. */
export function siteOrigin(): string {
  return process.env.CALLBACK_URL || "http://localhost:3000"
}
