/**
 * The six steps of setup, as data.
 *
 * In a plain module rather than beside the actions that use them, because a
 * `"use server"` file may export ONLY async functions. Exporting this array
 * from there compiles, passes `tsc`, passes `next build`, and then throws
 * `A "use server" file can only export async functions, found object` the
 * first time a page loads it. Nothing catches it earlier.
 */
export const ONBOARDING_STEPS = ["account", "business", "configure", "products", "payments", "golive"] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]
