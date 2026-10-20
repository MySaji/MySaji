export function mpesaScope(shop: { mpesaUseDemoCreds: boolean; mpesaEnv: string | null; mpesaShortcode: string | null }) {
  const platformEnvironment = (process.env.MPESA_ENV || "sandbox").toLowerCase()
  const demo = shop.mpesaUseDemoCreds && !["production", "live"].includes(platformEnvironment) && !!(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_PASSKEY && process.env.MPESA_SHORTCODE)
  return { demo, environment: demo ? "sandbox" : shop.mpesaEnv === "production" ? "production" : "sandbox", shortcode: demo ? process.env.MPESA_SHORTCODE! : shop.mpesaShortcode ?? "" }
}
