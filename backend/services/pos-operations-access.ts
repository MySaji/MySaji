import "server-only"
import { resolvePosActor } from "@/backend/services/pos-access-core"
import type { PosPermission } from "@/backend/domain/pos-permissions"
export async function operationsActor(permission:PosPermission,expectedShopId?:string){
 const actor=await resolvePosActor()
 return actor?.shopkeeperId&&actor.can(permission)&&(!expectedShopId||actor.shopkeeperId===expectedShopId)?actor:null
}
export const operationsFail=(error:string)=>({success:false as const,error})
