export function paymentSimulationAllowed(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV !== "production" && env.ALLOW_PAYMENT_SIMULATION === "true"
}
