import { WorkspaceHero, PosCard } from "@/frontend/components/pos/workspace-ui"
import { MpesaInbox } from "@/frontend/components/pos/mpesa-inbox"

export default function PaymentsPage() {
  return <div className="w-full min-w-0 space-y-5 p-4 md:p-6 xl:p-8"><WorkspaceHero title="M-Pesa payments" description="Track money received into your shop's Paybill or Till, reconcile direct payments, and follow customer prompts." /><PosCard className="p-4 md:p-6"><MpesaInbox /></PosCard></div>
}
