import { redirect } from "next/navigation"
import { auth } from "@/backend/auth"
import { Footer } from "@/frontend/components/footer"
import { LandingPage } from "@/frontend/components/pages/landing-page"
import { ROLE_HOME_PATH } from "@/backend/services/role-map"

/**
 * The public landing page, and the router for anyone already signed in.
 *
 * This used to be a client component that rendered a LoadingScreen until
 * useAuthContext resolved, then pushed a signed-in user to their portal. Two
 * things followed from that: a signed-in user watched a spinner before being
 * redirected, and — because the effects that cleared those gates never run on
 * the server — the most SEO-critical page in the app served crawlers an empty
 * body.
 *
 * Reading the session here fixes both. A signed-in user is redirected before
 * any HTML is sent, and a guest gets the full landing page server-rendered.
 *
 * Making this a server component costs nothing in caching: the root layout
 * already awaits auth(), so every route in this app is dynamic already (the
 * build reports 218 dynamic, 0 static). There is no static prerender to lose.
 */
export default async function Home() {
  const session = await auth()

  // auth.ts normalises the Prisma role enum to the app's lowercase form in the
  // JWT callback, so this is already a ROLE_HOME_PATH key. The `in` check keeps
  // an unrecognised role from producing redirect(undefined).
  const role = session?.user?.role
  if (role && role in ROLE_HOME_PATH) {
    redirect(ROLE_HOME_PATH[role as keyof typeof ROLE_HOME_PATH])
  }

  return (
    <div className="min-h-screen bg-background">
      <main>
        <LandingPage />
      </main>
      <Footer />
    </div>
  )
}
