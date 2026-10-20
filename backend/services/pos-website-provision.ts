import "server-only"
import type { Prisma } from "@prisma/client"
import { businessSubdomain, starterWebsite } from "@/backend/domain/pos-website"

export async function ensureBusinessWebsite(tx: Prisma.TransactionClient, business: { id: string; name: string }, category?: string) {
  // One short transaction-wide namespace lock makes suffix allocation safe across instances.
  // Return a boolean, never PostgreSQL's unsupported void column.
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(184223, 91812)`
  const existing = await tx.posBusinessWebsite.findUnique({ where: { businessId: business.id } })
  if (existing) return existing
  const base = businessSubdomain(business.name)
  let subdomain = base
  for (let number = 2; ; number++) {
    if (!(await tx.posBusinessWebsite.findUnique({ where: { subdomain }, select: { id: true } }))) break
    subdomain = `${base}-${number}`
    if (number > 10_000) throw new Error("Could not reserve a business website address")
  }
  return tx.posBusinessWebsite.create({ data: { businessId: business.id, subdomain, draft: starterWebsite(business.name, category) as Prisma.InputJsonValue } })
}
