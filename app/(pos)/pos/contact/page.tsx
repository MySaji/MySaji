import Link from "next/link"
import { ArrowLeft, Mail, Phone, MessageCircle, MapPin, Clock } from "lucide-react"

/**
 * How to reach somebody about the till.
 *
 * WHY THIS IS A PLAIN PAGE AND NOT A FORM
 *
 * A shopkeeper whose till will not open at 7am does not want to fill in a
 * form and wait. They want a number. So the contact details come first and
 * are the biggest thing on the page, and the form-shaped alternatives come
 * after.
 *
 * The questions below are the ones actually asked before somebody buys. They
 * are answered here rather than on a FAQ nobody opens, and answered honestly:
 * where something is not ready, it says so.
 */
export const metadata = {
  title: "Contact SAJI Till",
  description: "Talk to somebody about the SAJI till for your shop.",
}

const WAYS = [
  {
    icon: Phone,
    label: "Call or WhatsApp",
    value: "+254 700 000 000",
    href: "tel:+254700000000",
    note: "Fastest if your till is not working right now.",
  },
  {
    icon: Mail,
    label: "Email",
    value: "support@saji.co.ke",
    href: "mailto:support@saji.co.ke",
    note: "Best for setting up, billing and anything with a screenshot.",
  },
  {
    icon: MessageCircle,
    label: "In the app",
    value: "Help from inside your till",
    href: "/pos/home",
    note: "Signed in already? Reach us from your till so we can see your shop.",
  },
]

const QUESTIONS = [
  {
    q: "Do I need a SAJI shop or provider account?",
    a: "No. The till is its own thing, with its own sign-in. If you already have a SAJI account you can use the same email, but nothing from the marketplace is required.",
  },
  {
    q: "What does it cost?",
    a: "Setup and the monthly amount are set per shop, so the figure is agreed with you rather than listed here. Ask us and we will tell you plainly before you start.",
  },
  {
    q: "What happens when the internet goes?",
    a: "Sales carry on. They are stored on the device and sent up when the connection returns, and the till will not count the same sale twice. You will see exactly how many are still waiting to be sent.",
  },
  {
    q: "Can my staff have their own logins?",
    a: "Yes. You add them with the email or phone they already use, pick exactly which parts of the till they may open, and they are in the next time they sign in. Cashiers can also just use a PIN at the counter.",
  },
  {
    q: "Does it do KRA eTIMS?",
    a: "The tax invoicing is built in and waits for your KRA credentials. Until those are entered it will tell you plainly that nothing has been filed, rather than pretending it has.",
  },
  {
    q: "Can I use a barcode scanner and a receipt printer?",
    a: "Yes. Ordinary USB or Bluetooth counter scanners work as they are, with no setup. A phone camera works too if you do not have a scanner yet.",
  },
  {
    q: "What if I have more than one shop?",
    a: "Branches are supported. Stock moves between them with a dispatch and a receipt at the other end, and each branch keeps its own takings and its own staff.",
  },
  {
    q: "Can I get my data out?",
    a: "Yes. Reports export, and your products, customers and sales are yours. Ask us if you need a full copy.",
  },
]

export default function PosContactPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <nav aria-label="Main website" className="mx-auto max-w-3xl px-4 pt-3"><Link href="/" className="inline-flex min-h-8 items-center gap-2 text-xs font-medium text-blue-700 hover:underline"><ArrowLeft size={15} aria-hidden="true" />Back to MySaji</Link></nav>
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/pos"
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-4 h-4" /> SAJI Till
          </Link>
          <Link
            href="/pos/signup"
            className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center active:scale-95"
          >
            Get a till
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 pt-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Talk to us</h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed max-w-xl">
          About setting up a till, about one that is already running, or about
          whether this suits your shop at all.
        </p>

        <div className="mt-5 grid sm:grid-cols-3 gap-3">
          {WAYS.map((w) => (
            <a
              key={w.label}
              href={w.href}
              className="rounded-xl border border-border p-4 active:scale-[0.98] transition-transform block"
            >
              <w.icon className="w-5 h-5 text-primary" />
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {w.label}
              </p>
              <p className="mt-0.5 text-sm font-bold text-foreground break-words">{w.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{w.note}</p>
            </a>
          ))}
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border p-4 flex items-start gap-3">
            <Clock className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">When we answer</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Monday to Saturday, 8am to 7pm. A till that is down is answered
                outside those hours too.
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-border p-4 flex items-start gap-3">
            <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground">Where we are</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                Nairobi, Kenya. Setting up is done remotely, so you do not need
                to come to us.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-8">
        <h2 className="text-lg font-bold text-foreground">Asked before buying</h2>
        <dl className="mt-3 space-y-3">
          {QUESTIONS.map((item) => (
            <div key={item.q} className="rounded-xl border border-border p-4">
              <dt className="text-sm font-semibold text-foreground">{item.q}</dt>
              <dd className="mt-1 text-xs text-muted-foreground leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/pos/signup"
            className="h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center active:scale-[0.98]"
          >
            Set up your till
          </Link>
          <Link
            href="/pos/login"
            className="h-11 px-5 rounded-xl border border-border text-sm font-semibold inline-flex items-center text-foreground active:scale-[0.98]"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  )
}
