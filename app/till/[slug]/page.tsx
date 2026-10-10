import { redirect } from "next/navigation"
import Link from "next/link"
import type { Metadata } from "next"
import { auth } from "@/backend/auth"
import { db } from "@/backend/db"
import { getPublicTillShop } from "@/backend/actions/pos-install"

/**
 * A shop's own front door to its till.
 *
 * WHY THIS EXISTS SEPARATELY FROM /auth/login
 *
 * The counter device is set up once and then used by whoever is on shift.
 * That person is often not the account holder, is standing in a shop, and
 * has been given an address to type. Landing them on a generic marketplace
 * login asks them to work out which of several SAJI things they are signing
 * in to. Landing them on a page with their own shop's name on it does not.
 *
 * It is also what gets installed: this is the address on the QR code, so
 * it is the page the home-screen icon opens for anyone not yet signed in.
 *
 * WHAT IT IS NOT
 *
 * Not a credential. The URL is guessable by design — it is meant to be read
 * down a phone — so opening it grants nothing. It shows the shop's name so
 * you can tell you are at the right door, and then sends you to the real
 * login, which still wants a password and a code.
 */

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const shop = await getPublicTillShop(slug)
  return {
    title: shop ? `${shop.shopName} · Till` : "Till",
    // The installed icon should open this shop's till, not the marketplace.
    manifest: "/till-manifest.json",
    robots: { index: false, follow: false },
  }
}

export default async function ShopTillDoorPage({ params }: Props) {
  const { slug } = await params
  const shop = await getPublicTillShop(slug)

  if (!shop) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">No till at this address</h1>
          <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Check the spelling with whoever gave it to you. Addresses look like
            <span className="font-mono"> /till/your-shop-name</span>.
          </p>
          <Link
            href="/auth/login"
            className="mt-5 inline-flex h-11 px-5 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
          >
            Sign in to SAJI
          </Link>
        </div>
      </main>
    )
  }

  // Already the owner of this shop, on this device: go straight to the
  // register. Making someone who is signed in look at a sign-in page is the
  // commonest way an installed app feels broken.
  const session = await auth()
  if (session?.user?.id) {
    const mine = await db.shopkeeperProfile.findFirst({
      where: { userId: session.user.id, tillSlug: shop.slug },
      select: { id: true },
    })
    if (mine) redirect("/provider/till")
  }

  const initials = shop.shopName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="mx-auto w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
            {initials || "T"}
          </span>
          <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white leading-tight">
            {shop.shopName}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Till</p>
        </div>

        <Link
          href={`/auth/login?next=${encodeURIComponent("/provider/till")}`}
          className="mt-7 flex h-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          Sign in to open the till
        </Link>

        <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {/* Said here because the person reading it is usually staff, and
              "I do not have a SAJI password" is the first thing they think. */}
          Signing in is for whoever owns this shop&apos;s account. Once the till is open, staff
          use their own PINs &mdash; they do not need an account.
        </p>

        <p className="mt-6 text-center text-[11px] text-gray-400 dark:text-gray-500">
          Not your shop?{" "}
          <Link href="/auth/login" className="underline">
            Sign in to a different account
          </Link>
        </p>
      </div>
    </main>
  )
}
