export const CANCEL_REASONS = ["CHANGED_MIND", "ORDERED_BY_MISTAKE", "FOUND_CHEAPER", "TAKING_TOO_LONG", "OTHER"] as const
export type CancelReason = (typeof CANCEL_REASONS)[number]
