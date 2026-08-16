export const RETURN_REASONS = ["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "MISSING_ITEM", "OTHER"] as const
export type ReturnReason = (typeof RETURN_REASONS)[number]
