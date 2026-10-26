import { loadOperationsWorkspace } from "@/backend/services/pos-operations-workspace"
import { OperationsWorkspace } from "@/frontend/components/pos/operations-workspace"
export const dynamic="force-dynamic"
export const metadata={title:"Operations | Saji Till",robots:{index:false,follow:false}}
export default async function OperationsPage(){try{const data=await loadOperationsWorkspace();return data?<OperationsWorkspace key={data.shopId} data={data}/>:<p role="alert" className="p-8">Sign in to a Till branch with the relevant operations permissions.</p>}catch{return <p role="alert" className="p-8">Operations could not be loaded. Check connectivity and that the operations migration is installed, then refresh.</p>}}
