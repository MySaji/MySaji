const fs = require("node:fs")
// Read names and presence only. Never print configuration values.
const env = { ...process.env }
if (fs.existsSync(".env")) for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/)
  if (match && env[match[1]] === undefined) env[match[1]] = match[2].replace(/^['"]|['"]$/g, "").trim()
}
const required = ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "CALLBACK_URL", "CRON_SECRET"]
let failures = 0
for (const name of required) { const present = Boolean(env[name]); console.log(`${name}: ${present ? "present" : "MISSING"}`); if (!present) failures++ }
if (env.NODE_ENV === "production") {
  if (!env.CALLBACK_URL?.startsWith("https://")) { console.log("CALLBACK_URL: production requires HTTPS"); failures++ }
  if (env.ALLOW_PAYMENT_SIMULATION === "true") { console.log("ALLOW_PAYMENT_SIMULATION: must be false in production"); failures++ }
}
for (const [label, names] of Object.entries({
  mpesa: ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY"],
  stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], paypal: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_KES_TO_USD_RATE"],
  email: ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"], turn: ["TURN_URL", "TURN_SHARED_SECRET"], monitoring: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
})) console.log(`${label}: ${names.every(name => Boolean(env[name])) ? "configured (not connectivity-tested)" : "incomplete or disabled"}`)
process.exitCode = failures ? 1 : 0
