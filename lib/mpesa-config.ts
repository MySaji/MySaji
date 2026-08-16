// Plain config-check helpers, not a "use server" module — kept separate from
// lib/actions/payments.ts because Server Action files may only export async
// functions, and this needs to be called synchronously from non-action code
// (e.g. mapping withdrawal rows to a "canAutoPay" flag).

export function mpesaB2CConfigured() {
  return Boolean(
    process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET &&
    process.env.MPESA_B2C_SHORTCODE && process.env.MPESA_INITIATOR_NAME &&
    process.env.MPESA_INITIATOR_PASSWORD && process.env.MPESA_B2C_CERT,
  )
}
