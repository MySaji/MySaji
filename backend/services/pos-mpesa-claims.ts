import "server-only"
import type { Prisma } from "@prisma/client"

export async function claimReceivedMpesa(tx: Prisma.TransactionClient, input: { id: string; shopkeeperId: string; saleId: string; amount: Prisma.Decimal }) {
  const claimed = await tx.posMpesaTransaction.updateMany({ where: { id: input.id, shopkeeperId: input.shopkeeperId, status: "PAID", consumedSaleId: null, amount: input.amount }, data: { consumedSaleId: input.saleId } })
  if (claimed.count !== 1) throw Error("That M-Pesa payment was already used, changed, or does not match this sale.")
}
