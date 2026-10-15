import "server-only"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

export async function activeUser() {
  const session = await auth()
  if (!session?.user?.id) return null
  const user = await db.user.findUnique({ where: { id: session.user.id } })
  return user?.isActive && !user.deletedAt ? user : null
}
