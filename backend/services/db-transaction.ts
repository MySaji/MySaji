import "server-only"
import { Prisma } from "@prisma/client"
import { db } from "@/backend/db"

export async function serialTransaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(run, { isolationLevel: "Serializable", timeout: 20_000 })
    } catch (error) {
      if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error
    }
  }
}
