"use client"

import useSWR from "swr"
import { getMyProCapabilities, type MyProCapabilities } from "@/backend/actions/pro-capabilities"
import { PRO_MODULE_BY_KEY, type ProModule } from "@/backend/domain/pro-modules"

const KEY = "my-pro-capabilities"

/**
 * The signed-in Saji Pro account's business types and the portal modules they
 * unlock. SWR-cached under one key (same pattern as useProviderWorkspace) so
 * the sidebar, the topbar and any page that needs it share a single fetch.
 *
 * `isLoading` matters to callers: rendering a nav from an empty module list
 * while the first request is still in flight would flash an almost-empty
 * sidebar on every cold load, so consumers should keep showing their previous
 * shape until this settles.
 */
export function useProCapabilities(): {
  data: MyProCapabilities | undefined
  isLoading: boolean
  /** Module keys as a Set, for cheap membership tests in a render loop. */
  moduleKeys: Set<string>
  /** Resolved module definitions, already in PRO_MODULES order. */
  modules: ProModule[]
  workSlot: { label: string; href: string }
  refresh: () => void
} {
  const { data, isLoading, mutate } = useSWR(KEY, getMyProCapabilities)

  const keys = data?.moduleKeys ?? []
  return {
    data,
    isLoading,
    moduleKeys: new Set(keys),
    modules: keys.map((k) => PRO_MODULE_BY_KEY[k]).filter(Boolean),
    workSlot: data?.workSlot ?? { label: "Work", href: "/provider/jobs" },
    refresh: () => void mutate(),
  }
}

export const PRO_CAPABILITIES_SWR_KEY = KEY
