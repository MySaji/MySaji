"use client"

import { ProBusinessControl } from "@/components/pro-business/pro-business-control"

/** Agents review requests but don't rewrite the platform-wide page matrix —
 *  setProModuleEnabled refuses them server-side either way. */
export default function AgentProBusinessPage() {
  return <ProBusinessControl canEditMatrix={false} />
}
