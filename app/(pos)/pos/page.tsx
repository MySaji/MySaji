import { pageMetadata } from "@/frontend/lib/seo"
export const metadata = pageMetadata("/pos", "Saji Till", "Learn about Saji Till counter sales, stock records, receipts, offline sales and staff tools for your shop.")

import Link from "next/link"
import { auth } from "@/backend/auth"
import { posDestination } from "@/backend/actions/pos-onboarding"
import {
  ShoppingCart, Boxes, Users, BarChart3, WifiOff, Receipt, Scale, Store,
  Smartphone, ClipboardCheck, ArrowRight, Check,
} from "lucide-react"

/**
 * /pos, which is the address a shopkeeper will be given or will type.
 *
 * WHY THIS IS A PAGE AND NOT A REDIRECT
 *
 * It used to decide silently: signed in with a till, go to the till; signed
 * in without one, go to sign-up; signed out, go to login. That is efficient
 * for somebody who already knows what this is, and useless for everybody
 * else. Most people arriving here have been told "SAJI does a till" and have
 * no idea what that means, what it costs, or whether it works when the line
 * drops. Bouncing them to a login form answers none of it.
 *
 * So this says what the thing is. Somebody who already has a till still gets
 * one tap to it, at the top, which costs them nothing.
 *
 * It names no price. The subscription is set per shop by an admin, so a
 * figure here would be wrong for somebody.
 */
export const dynamic = "force-dynamic"

const FEATURES = [
  {
    icon: ShoppingCart,
    title: "A counter that keeps up",
    body: "Scan with a barcode reader, weigh by the kilo, split a payment between cash and M-Pesa, and print or send the receipt.",
  },
  {
    icon: WifiOff,
    title: "Works when the line drops",
    body: "Sales carry on when the internet does not. They queue on the device and go up by themselves when it comes back, and nothing is counted twice.",
  },
  {
    icon: Boxes,
    title: "Stock that adds up",
    body: "Every movement is recorded, so what the system thinks is on the shelf can be checked against what is actually there. Count a shelf, approve the difference, and see what it cost you.",
  },
  {
    icon: Users,
    title: "Your people, with limits",
    body: "Cashiers, stock controllers, managers and an accountant, each seeing only their own part. Everyone signs in with their own PIN, so every sale has a name on it.",
  },
  {
    icon: Receipt,
    title: "KRA eTIMS when you are ready",
    body: "Tax invoices are built in. Until your credentials are entered it will tell you plainly that nothing has been filed, rather than pretending.",
  },
  {
    icon: BarChart3,
    title: "Figures you can act on",
    body: "Takings by day, by cashier and by product; what the shift should have in the drawer; what you spent; and what you are actually making after costs.",
  },
]

const TRADES = [
  { icon: Store, label: "Shops and supermarkets" },
  { icon: Scale, label: "Cereals, butchery and produce sold by weight" },
  { icon: ClipboardCheck, label: "Pharmacy and agrovet, with batches and expiry" },
  { icon: Smartphone, label: "Phones and electronics, tracked by IMEI" },
  { icon: Receipt, label: "Garages, salons and laundries that take work in" },
  { icon: ShoppingCart, label: "Restaurants, with tables and a kitchen screen" },
]

export default async function PosLandingPage() {
  const session = await auth()

  // The same function the sign-in screen uses, so the button here and the
  // redirect there can never send somebody to different places.
  const destination = session?.user?.id ? await posDestination() : "/pos/signup"
  const hasTill = destination === "/pos/home" || destination === "/pos/sell" || destination === "/pos/setup"

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-foreground">
            SAJI <span className="text-primary">Till</span>
          </span>
          <div className="flex items-center gap-2">
            {hasTill ? (
              <Link
                href={destination}
                className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 active:scale-95"
              >
                Open your till <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <>
                  <Link
                  href="/pos/contact"
                  className="h-9 px-3 rounded-lg text-xs font-semibold inline-flex items-center text-muted-foreground hover:text-foreground active:scale-95"
                >
                  Contact
                </Link>
              <Link
                  href="/pos/login"
                  className="h-9 px-3 rounded-lg border border-border text-xs font-semibold inline-flex items-center text-foreground active:scale-95"
                >
                  Sign in
                </Link>
                <Link
                  href="/pos/signup"
                  className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center active:scale-95"
                >
                  Get a till
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-4 pt-10 pb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground leading-tight">
          A till for your shop, not a spreadsheet
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Ring up sales, keep track of stock, know what the drawer should hold at
          the end of a shift, and see what you are really making. It runs on the
          phone in your pocket or a monitor on the counter, and it keeps working
          when the internet does not.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={hasTill ? destination : "/pos/signup"}
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 active:scale-[0.98]"
          >
            {hasTill ? "Open your till" : "Set up your till"} <ArrowRight className="w-4 h-4" />
          </Link>
          {!hasTill && (
            <Link
              href="/pos/login"
              className="h-11 px-5 rounded-xl border border-border text-sm font-semibold inline-flex items-center text-foreground active:scale-[0.98]"
            >
              I already have one
            </Link>
          )}
        </div>
        {/* Said plainly, because it is the first question a shopkeeper asks
            and burying it would read as a catch. */}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Set up in a few minutes. Nothing to install.
        </p>
      </section>

      <section className="border-y border-border bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 py-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <f.icon className="w-5 h-5 text-primary" />
              <h2 className="mt-2 text-sm font-bold text-foreground">{f.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-lg font-bold text-foreground">Set up for your trade</h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-2xl">
          You pick what kind of shop you run and the till configures itself: what
          it asks for at the counter, what it tracks, and what it warns you about.
          You can change any of it afterwards.
        </p>
        <ul className="mt-4 grid sm:grid-cols-2 gap-2">
          {TRADES.map((t) => (
            <li key={t.label} className="flex items-start gap-2 rounded-xl border border-border p-3">
              <t.icon className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-xs text-foreground leading-relaxed">{t.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <h2 className="text-lg font-bold text-foreground">What you get on day one</h2>
          <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {[
              "Your own sign-in, separate from the rest of SAJI",
              "Unlimited products and customers",
              "Barcode scanning on a phone camera or a counter scanner",
              "Cash, M-Pesa, card, bank, gift cards and credit",
              "Shift open and close, with the drawer counted",
              "Staff PINs and role limits you set yourself",
              "Receipts to print, or sent by SMS",
              "Several branches under one business",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-xs text-foreground leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={hasTill ? destination : "/pos/signup"}
              className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-1.5 active:scale-[0.98]"
            >
              {hasTill ? "Open your till" : "Set up your till"} <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/pos/login"
              className="h-11 px-5 rounded-xl border border-border text-sm font-semibold inline-flex items-center text-foreground active:scale-[0.98]"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-[11px] text-muted-foreground">
          SAJI Till is part of SAJI. You do not need a SAJI shop or provider
          account to use it.
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Questions before you start?{" "}
          <Link href="/pos/contact" className="text-primary font-medium">Talk to us</Link>.
        </p>
      </footer>
    </main>
  )
}
