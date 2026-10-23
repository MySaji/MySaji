import { Prisma, PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaSchema?: string }
// Hot reload must not reuse a client generated before new models/fields existed.
// Production uses the client bundled with its build; this cache is development-only.
const schema = JSON.stringify(Prisma.dmmf.datamodel)
const cached = process.env.NODE_ENV !== "production" && globalForPrisma.prismaSchema === schema ? globalForPrisma.prisma : undefined

export const db =
  cached ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db
  globalForPrisma.prismaSchema = schema
}
