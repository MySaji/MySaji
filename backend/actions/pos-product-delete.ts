"use server"

import { z } from "zod"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"
import { requirePosPermission, recordPosAudit } from "@/backend/services/pos-access-core"

export async function deleteTillProducts(input: unknown): Promise<{ success: true; deleted: number } | { success: false; error: string }> {
  const parsed = z.object({ productIds: z.array(z.string().trim().min(1).max(100)).min(1).max(200) }).safeParse(input)
  if (!parsed.success) return { success: false, error: "Select between 1 and 200 products to delete." }
  const permission = await requirePosPermission("product.edit")
  if (!permission.ok) return { success: false, error: permission.error }
  const { actor } = permission
  if (!actor.shopkeeperId) return { success: false, error: "No store is selected." }
  const ids = [...new Set(parsed.data.productIds)]
  // Never cascade away business history, even when the schema allows it.
  const unused: Prisma.ProductWhereInput = {
    id: { in: ids }, shopkeeperId: actor.shopkeeperId, totalSold: 0,
    OR: [{ inventory: null }, { inventory: { is: { currentStock: 0, reservedStock: 0, OR: [{ stockOnHand: null }, { stockOnHand: 0 }] } } }],
    stockMovements: { none: {} }, posSaleItems: { none: {} }, orderItems: { none: {} },
    posCountLines: { none: {} }, posJobLines: { none: {} }, posQuoteLines: { none: {} },
    posTableLines: { none: {} }, posTransferLines: { none: {} }, posTransferLinesIn: { none: {} },
    restockedByWholesaleItems: { none: {} }, requestResponses: { none: {} }, reviews: { none: {} },
    variants: { none: {} }, batches: { none: {} }, serials: { none: {} },
    posPromotions: { none: {} }, posPriceListItems: { none: {} }, liveSessionFeatures: { none: {} },
    cartItems: { none: {} }, wishlistedBy: { none: {} },
  }
  try {
    const deleted = await db.$transaction(async tx => {
      const eligible = await tx.product.findMany({ where: unused, select: { id: true } })
      if (eligible.length !== ids.length) return false
      const result = await tx.product.deleteMany({ where: unused })
      if (result.count !== ids.length) throw new Error("Products changed during deletion")
      return result.count
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    if (deleted === false) return { success: false, error: "Nothing was deleted. Some selected products have stock, history, options or other linked records, or are no longer available. Pause selling for products you need to retain." }
    await recordPosAudit({ actor, action: "product.delete", summary: `${actor.name} deleted ${deleted} unused product(s)`, entityType: "product", detail: { productIds: ids } })
    return { success: true, deleted }
  } catch {
    return { success: false, error: "Nothing was deleted. The products may be in use or have changed. Refresh and try again." }
  }
}
