import "server-only"

import { z } from "zod"

import { db } from "@/backend/db"

import { etimsSettingsComplete } from "@/backend/domain/etims"

export async function queueSaleForEtims(input: unknown): Promise<{ queued: boolean }> {
  const parsed = z.object({
    saleId: z.string().trim().min(1),
    kind: z.enum(["INVOICE", "CREDIT_NOTE"]).optional(),
  }).safeParse(input)
  if (!parsed.success) return { queued: false }
  const { saleId } = parsed.data
  const kind = parsed.data.kind ?? "INVOICE"

  try {
    const sale = await db.posSale.findUnique({
      where: { id: saleId },
      select: { id: true, shopkeeperId: true, saleNumber: true },
    })
    if (!sale) return { queued: false }

    const shop = await db.shopkeeperProfile.findUnique({
      where: { id: sale.shopkeeperId },
      select: {
        etimsEnabled: true, etimsTin: true, etimsBranchId: true,
        etimsDeviceSerial: true, etimsCmcKey: true,
      },
    })

    // A shop that does not file still gets a row, marked as skipped. The
    // alternative is a gap in the sequence that nobody can later explain.
    const status = etimsSettingsComplete({
      etimsEnabled: shop?.etimsEnabled ?? false,
      etimsTin: shop?.etimsTin ?? null,
      etimsBranchId: shop?.etimsBranchId ?? null,
      etimsDeviceSerial: shop?.etimsDeviceSerial ?? null,
      etimsCmcKey: shop?.etimsCmcKey ?? null,
    })
      ? "QUEUED"
      : "SKIPPED"

    await db.posEtimsInvoice.upsert({
      where: { posSaleId_kind: { posSaleId: sale.id, kind: kind as never } },
      update: {},
      create: {
        shopkeeperId: sale.shopkeeperId,
        posSaleId: sale.id,
        kind: kind as never,
        status: status as never,
        invoiceNumber: kind === "CREDIT_NOTE" ? sale.saleNumber + "-CN" : sale.saleNumber,
      },
    })
    return { queued: status === "QUEUED" }
  } catch {
    // Never surfaces at the counter. A sweep picks up anything missed.
    return { queued: false }
  }
}
