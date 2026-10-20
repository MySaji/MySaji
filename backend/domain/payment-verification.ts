export function matchesGatewayAmount(expected: { amount: number; currency: string }, actual: { amount: number; currency: string }): boolean {
  return Number.isFinite(expected.amount) && expected.amount > 0 && Number.isFinite(actual.amount)
    && Math.round(expected.amount * 100) === Math.round(actual.amount * 100)
    && expected.currency.toUpperCase() === actual.currency.toUpperCase()
}
