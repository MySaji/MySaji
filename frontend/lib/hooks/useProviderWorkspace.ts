"use client"

import useSWR from "swr"
import { getMyProviderBusinessInfo } from "@/backend/actions/provider-business"
import { getMySubscriptionStatus } from "@/backend/actions/provider-subscription"

export type ProviderWorkspaceType = "solo" | "business_owner" | "field_technician"

const WORKSPACE_KEY = "provider-workspace-type"
const PRO_STATUS_KEY = "provider-workspace-pro-status"

/**
 * Adaptive UI Workspaces — derives which of the three provider experiences
 * (Solo Pro / Business Manager / Field Technician) the signed-in provider
 * should see, from the same ProviderProfile fields the business-account
 * feature set already reads (isBusinessOwner, parentBusinessId). SWR-
 * cached (same pattern as useCartCount) so every consumer — sidebar,
 * dashboard, topbar — shares one fetch instead of one each.
 *
 * `isPro` rides alongside the workspace type rather than being folded into
 * it as a fourth type — a Pro subscriber who hasn't converted to a
 * Business is still fundamentally the "solo" experience (same nav shape),
 * just with one extra unlocked item (Team — see provider-sidebar.tsx).
 * Business owners already get the full team-management surface regardless
 * of Pro status, so `isPro` only actually changes anything for `solo`.
 */
export function useProviderWorkspace(): { type: ProviderWorkspaceType; isLoading: boolean; isPro: boolean } {
  const { data, isLoading } = useSWR(WORKSPACE_KEY, getMyProviderBusinessInfo)
  const { data: subscription } = useSWR(PRO_STATUS_KEY, getMySubscriptionStatus)
  const type: ProviderWorkspaceType = data?.isBusinessOwner
    ? "business_owner"
    : data?.parentBusinessId
      ? "field_technician"
      : "solo"
  return { type, isLoading, isPro: subscription?.isPro ?? false }
}
