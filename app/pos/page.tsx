import { redirect } from "next/navigation"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"

/**
 * /pos, which is the address a shopkeeper will type or be given.
 *
 * It decides rather than asking. Someone arriving here either has a till or
 * wants one, and the four cases are all answerable from what we already
 * know, so nothing is gained by showing a page with two buttons on it.
 */
export const dynamic = "force-dynamic"

export default async function PosEntryPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/pos/login")

  const business = await db.posBusiness.findUnique({
    where: { ownerUserId: session.user.id },
    select: { setupCompletedAt: true },
  })

  // An owner mid-setup resumes it; a finished one goes to work.
  if (business) redirect(business.setupCompletedAt ? "/provider/till/dashboard" : "/pos/setup")

  // Signed in, but this account is staff rather than an owner. The staff
  // seat decides what they see, and the till is where they are needed.
  const seat = await db.posStaff.findFirst({
    where: { userId: session.user.id, isActive: true },
    select: { id: true },
  })
  if (seat) redirect("/provider/till")

  // Signed in to SAJI, with no till of any kind. Offer to set one up rather
  // than bouncing them to a login they are already past.
  redirect("/pos/signup")
}
