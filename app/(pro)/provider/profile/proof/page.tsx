import { redirect } from "next/navigation"

/**
 * The work portfolio used to live here, under Profile, which is why nobody
 * found it — it now has its own sidebar entry at /provider/portfolio.
 *
 * This redirect stays because the old path is linked from saved bookmarks and
 * from the onboarding checklist rows that shipped before the move.
 */
export default function ProofOfWorkRedirect() {
  redirect("/provider/portfolio")
}
