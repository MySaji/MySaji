"use client"

import Link from "next/link"
import { useEffect, useRef, useState, type ComponentType } from "react"
import { motion, AnimatePresence, useReducedMotion, useInView, animate, useScroll, useSpring, useMotionValue, useMotionTemplate } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  ArrowRight, Zap, Lock, CheckCircle, ShieldCheck, Smartphone, MessageCircle, Star,
  Menu, X, Download,
  Plug, Droplets, Hammer, Wind, Truck, Paintbrush, BriefcaseBusiness,
  Search, CalendarCheck, CreditCard, ThumbsUp, Home, Wrench, Store,
} from "lucide-react"
import { getServiceCategories, getLandingStats, type HomeServiceCategory, type LandingStats } from "@/lib/actions/home"
import { usePwaInstall } from "@/lib/hooks/usePwaInstall"
import PublicChatButton from "@/components/public-chat-button"
import { BrandLogo } from "@/components/brand-logo"

const CATEGORY_ICON: Record<string, ComponentType<{ className?: string }>> = {
  electricians: Plug,
  plumbers: Droplets,
  handymen: Hammer,
  carpenters: Hammer,
  cleaners: Wind,
  "ac-repair": Wind,
  movers: Truck,
  "freelance-designers": Paintbrush,
}

const FEATURES = [
  { icon: Zap, title: "Instant Booking", description: "Find and book a verified professional in minutes. No phone calls, no waiting around.", color: "from-blue-500 to-blue-600" },
  { icon: ShieldCheck, title: "Verified Professionals", description: "Every provider is vetted and rated by real customers, so you know who's showing up.", color: "from-cyan-500 to-blue-500" },
  { icon: Smartphone, title: "Secure M-Pesa & Card Payments", description: "Pay safely in-app with M-Pesa or card. Funds are only released once the job is done.", color: "from-blue-600 to-indigo-600" },
  { icon: Lock, title: "Dispute Protection", description: "If something goes wrong, our support team steps in to make it right.", color: "from-indigo-500 to-purple-600" },
  { icon: MessageCircle, title: "In-App Messaging", description: "Chat directly with your provider to coordinate timing, location, and details.", color: "from-purple-500 to-pink-500" },
  { icon: Star, title: "Real Reviews", description: "Ratings and reviews from real completed jobs, not marketing copy.", color: "from-pink-500 to-red-500" },
]

const HERO_HIGHLIGHTS = [
  { label: "Booking", value: "Instant & Scheduled", icon: Zap },
  { label: "Payments", value: "M-Pesa & Card", icon: CreditCard },
  { label: "Providers", value: "Verified & Rated", icon: CheckCircle },
  { label: "Protection", value: "Dispute Support", icon: Lock },
]

const AUDIENCES = [
  {
    name: "For Customers",
    icon: Home,
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&h=400&fit=crop&q=80",
    description: "Book trusted professionals for home repairs, cleaning, and more. Pay securely and track every job.",
    items: ["Instant & scheduled booking", "Secure in-app payments", "Real-time job tracking"],
  },
  {
    name: "For Providers",
    icon: Wrench,
    image: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&q=80",
    description: "Grow your business with a steady stream of real job requests, invoicing tools, and fast payouts.",
    items: ["Real job requests, not leads", "Invoices & quotes built in", "Fast M-Pesa payouts"],
  },
  {
    name: "For Shop Owners",
    icon: Store,
    image: "https://images.unsplash.com/photo-1556740758-90de374c12ad?w=600&h=400&fit=crop&q=80",
    description: "List your hardware or supplies shop and reach customers already booking services on SAJI.",
    items: ["Storefront on the marketplace", "Order & inventory management", "Promotions to featured customers"],
  },
]

const HOW_IT_WORKS = [
  { icon: Search, title: "Search & Compare", description: "Browse verified providers by category, location, and rating, or let our AI search point you to the right match." },
  { icon: CalendarCheck, title: "Book Instantly", description: "Pick a time that works for you and book in a couple of taps, instantly or scheduled ahead." },
  { icon: CreditCard, title: "Pay Securely", description: "Pay with M-Pesa or card in-app. Funds are held safely and only released once the job is done." },
  { icon: ThumbsUp, title: "Done & Reviewed", description: "Your provider completes the job, you confirm it, and leave a real review for the next customer." },
]

const FAQS = [
  {
    question: "How do you verify providers?",
    answer: "Every provider goes through an identity and document review before they can accept jobs, and their rating is built entirely from real, completed-job reviews, not self-reported claims.",
  },
  {
    question: "Is it safe to pay through the app?",
    answer: "Yes. Payments are made securely via M-Pesa or card, and funds are only released to the provider once you've confirmed the job is complete. If something isn't right, our dispute support team steps in.",
  },
  {
    question: "What happens if something goes wrong with a job?",
    answer: "You can raise a dispute directly from the job in the app. Our support team reviews the details and works with both sides to resolve it, including refunds where appropriate.",
  },
  {
    question: "Can I book a service for later instead of right now?",
    answer: "Yes. Every service supports both instant booking for urgent needs and scheduled booking for a specific date and time that works for you.",
  },
  {
    question: "How do I become a provider or list my shop on SAJI?",
    answer: "Sign up and choose \"Become a Provider\" or \"List a Shop\". You'll submit your details for verification, and once approved you can start accepting jobs or listing products right away.",
  },
]

// Real Unsplash photography used across the hero and CTA sections — no
// literal <video> embed (this project has no video hosting/CDN and an
// unverified external file would be a reliability/licensing risk), so a
// slow continuous Ken-Burns zoom on real stock photos stands in for that
// "living" motion instead of a static image.
const HERO_IMAGE = "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&h=900&fit=crop&q=80"
const HERO_ACCENT_IMAGE = "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?w=400&h=400&fit=crop&q=80"
const FEATURES_BACKGROUND_IMAGE = "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=1600&h=900&fit=crop&q=80"
const CTA_BACKGROUND_IMAGE = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&h=900&fit=crop&q=80"

/** Continuous slow zoom on a real photo — the "video" feel from a stock
 * image without the risk of an unverified external video file. Respects
 * reduced-motion (falls back to a static image). */
function KenBurnsImage({ src, alt, className, duration = 20 }: { src: string; alt: string; className?: string; duration?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.img
      src={src}
      alt={alt}
      className={className}
      animate={ambient(reduce, { scale: [1, 1.08, 1] })}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
    />
  )
}

// ---------------------------------------------------------------------------
// Motion primitives — kept small and reused everywhere below instead of
// hand-rolling transition props on every element, so every section moves to
// the same rhythm. Distances/durations collapse to a plain fade whenever the
// visitor has requested reduced motion (see useReducedMotion() below).
// ---------------------------------------------------------------------------

// A `number[]` literal isn't assignable to framer-motion's `Easing` tuple
// type — `as const` narrows it to the exact 4-tuple every transition below expects.
const EASE_OUT = [0.22, 1, 0.36, 1] as const

// Bouncier, more tactile feel for card hover lifts than a flat easeOut
// duration — springs settle with a touch of overshoot instead of just
// stopping, which reads as noticeably more premium/responsive.
const HOVER_SPRING = { type: "spring", stiffness: 300, damping: 20 } as const

function useMotionVariants() {
  const reduce = useReducedMotion()
  const fadeUp = {
    hidden: { opacity: 0, y: reduce ? 0 : 28 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
  }
  const stagger = (delayChildren = 0, staggerChildren = 0.1) => ({
    hidden: {},
    visible: { transition: { delayChildren, staggerChildren } },
  })
  const scaleIn = {
    hidden: { opacity: 0, scale: reduce ? 1 : 0.92 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE_OUT } },
  }
  return { reduce, fadeUp, stagger, scaleIn }
}

/** Continuous ambient animations (drifting orbs, bobbing icons) aren't
 * covered by framer-motion's reduced-motion handling the way `whileInView`/
 * variant-based ones are — they need an explicit opt-out, since looping
 * motion is exactly the kind of thing prefers-reduced-motion exists for. */
function ambient<T>(reduce: boolean | null, animateProps: T): T | undefined {
  return reduce ? undefined : animateProps
}

/** Counts up from 0 to `value` once it scrolls into view, instead of just
 * popping the final number in — a small, tasteful signal that these are
 * live figures, not static marketing copy. */
function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const reduce = useReducedMotion()
  const [display, setDisplay] = useState(reduce ? value : 0)

  useEffect(() => {
    if (!inView || reduce) return
    const controls = animate(0, value, {
      duration: 1.4,
      ease: EASE_OUT,
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [inView, value, reduce])

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  )
}

function StatsSectionSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-8 animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="text-center">
          <div className="h-9 w-16 bg-muted rounded mx-auto mb-2" />
          <div className="h-4 w-24 bg-muted rounded mx-auto" />
        </div>
      ))}
    </div>
  )
}

function UseCasesSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
      {[...Array(8)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl" />)}
    </div>
  )
}

/** Small pill label above a section heading — echoes the hero's own "Book
 * trusted help, fast" badge so every section shares the same visual
 * language instead of the hero being the only one with this treatment. */
function SectionKicker({ children }: { children: string }) {
  return (
    <span className="inline-block px-3 py-1 mb-4 rounded-full bg-primary/10 text-primary text-xs font-semibold tracking-wide uppercase">
      {children}
    </span>
  )
}

/** Faint repeating-dot texture, faded out via a radial mask so it reads as
 * ambient depth behind the hero rather than a hard-edged grid. */
function DotGridBackground() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 opacity-[0.06] dark:opacity-[0.1] text-foreground"
      style={{
        backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        maskImage: "radial-gradient(ellipse 60% 50% at 50% 30%, black 40%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 60% 50% at 50% 30%, black 40%, transparent 80%)",
      }}
    />
  )
}

/** Thin bar across the very top that fills as the visitor scrolls down the
 * page — cheap, continuous feedback that the page is long/alive, distinct
 * from the nav's own scroll-elevation shadow below. */
function ScrollProgressBar() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 })
  return (
    <motion.div
      aria-hidden
      className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary to-blue-600 origin-left z-[60]"
      style={{ scaleX }}
    />
  )
}

/** Tracks whether the page has scrolled past the hero — drives the nav's
 * scroll-elevation shadow and the mobile sticky CTA bar. rAF-throttled so
 * the scroll handler runs at most once per painted frame instead of once
 * per raw scroll event (which can fire far more often than the screen can
 * even paint, especially from a trackpad/high-refresh display) — real work
 * on the main thread competing with the browser's own scroll handling. */
function useScrolledPast(thresholdPx: number) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > thresholdPx)
        ticking = false
      })
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [thresholdPx])
  return scrolled
}

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [stats, setStats] = useState<LandingStats | null>(null)
  const [categories, setCategories] = useState<HomeServiceCategory[]>([])
  const [isLoadingLive, setIsLoadingLive] = useState(true)
  const { reduce, fadeUp, stagger, scaleIn } = useMotionVariants()
  const scrolledPastHero = useScrolledPast(420)
  const { canInstall, promptInstall } = usePwaInstall()

  // Cursor-reactive glow in the hero — a soft radial spotlight that follows
  // the pointer with a light spring lag, instead of a static gradient. Desktop
  // (mouse) only; reduced-motion visitors get the plain gradient/orbs alone.
  const heroMouseX = useMotionValue(0)
  const heroMouseY = useMotionValue(0)
  const spotlightX = useSpring(heroMouseX, { stiffness: 150, damping: 20 })
  const spotlightY = useSpring(heroMouseY, { stiffness: 150, damping: 20 })
  const spotlightBackground = useMotionTemplate`radial-gradient(500px circle at ${spotlightX}px ${spotlightY}px, rgba(37,99,235,0.16), transparent 70%)`

  useEffect(() => {
    let cancelled = false
    Promise.all([getLandingStats(), getServiceCategories()]).then(([s, cats]) => {
      if (cancelled) return
      setStats(s)
      setCategories(cats)
      setIsLoadingLive(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const benefits = stats
    ? [
        { value: stats.categoryCount, desc: "Service Categories" },
        { value: stats.verifiedProviderCount, desc: "Verified Providers" },
        { value: stats.shopCount, desc: "Local Shops" },
      ]
    : []

  return (
    <div className="min-h-screen bg-background overflow-x-clip">
      <PublicChatButton />
      <ScrollProgressBar />

      {/* Navigation */}
      <motion.nav
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className={`fixed top-0 w-full backdrop-blur z-50 border-b transition-shadow duration-300 ${
          scrolledPastHero ? "bg-background/95 border-border shadow-sm" : "bg-background/80 border-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <BrandLogo size="small" />
              <Link href="/">
                <span className="font-bold text-lg text-foreground">SAJI</span>
              </Link>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex gap-8">
              {[
                { href: "#how-it-works", label: "How It Works" },
                { href: "#features", label: "Features" },
                { href: "#audiences", label: "Who It's For" },
                { href: "#categories", label: "Services" },
                { href: "#faq", label: "FAQ" },
              ].map((link) => (
                <a key={link.href} href={link.href} className="relative text-muted-foreground hover:text-foreground transition-colors font-medium group">
                  {link.label}
                  <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-primary transition-all duration-300 group-hover:w-full" />
                </a>
              ))}
            </div>

            <div className="hidden md:flex gap-3">
              {canInstall && (
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    className="font-medium gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0"
                    onClick={promptInstall}
                  >
                    <Download className="w-4 h-4" /> Download App
                  </Button>
                </motion.div>
              )}
              <Link href="/auth/login">
                <Button variant="ghost" className="font-medium">Sign In</Button>
              </Link>
              <Link href="/auth/signup">
                <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                  <Button className="bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-white font-medium">
                    Get Started <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </motion.div>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button className="md:hidden p-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
              <AnimatePresence mode="wait" initial={false}>
                {mobileMenuOpen ? (
                  <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }} className="block">
                    <X className="w-6 h-6" />
                  </motion.span>
                ) : (
                  <motion.span key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }} className="block">
                    <Menu className="w-6 h-6" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>

          {/* Mobile Menu */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="md:hidden overflow-hidden border-t border-border"
              >
                <motion.div
                  className="py-4 space-y-3"
                  initial="hidden"
                  animate="visible"
                  variants={stagger(0.05, 0.06)}
                >
                  <motion.a variants={fadeUp} href="#how-it-works" className="block py-2 text-foreground font-medium" onClick={() => setMobileMenuOpen(false)}>How It Works</motion.a>
                  <motion.a variants={fadeUp} href="#features" className="block py-2 text-foreground font-medium" onClick={() => setMobileMenuOpen(false)}>Features</motion.a>
                  <motion.a variants={fadeUp} href="#audiences" className="block py-2 text-foreground font-medium" onClick={() => setMobileMenuOpen(false)}>Who It's For</motion.a>
                  <motion.a variants={fadeUp} href="#categories" className="block py-2 text-foreground font-medium" onClick={() => setMobileMenuOpen(false)}>Services</motion.a>
                  <motion.a variants={fadeUp} href="#faq" className="block py-2 text-foreground font-medium" onClick={() => setMobileMenuOpen(false)}>FAQ</motion.a>
                  {canInstall && (
                    <motion.div variants={fadeUp}>
                      <Button
                        className="w-full gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0"
                        onClick={() => { setMobileMenuOpen(false); promptInstall() }}
                      >
                        <Download className="w-4 h-4" /> Download App
                      </Button>
                    </motion.div>
                  )}
                  <motion.div variants={fadeUp} className="flex gap-2 pt-4 border-t border-border">
                    <Link href="/auth/login" className="flex-1">
                      <Button variant="outline" className="w-full bg-transparent">Sign In</Button>
                    </Link>
                    <Link href="/auth/signup" className="flex-1">
                      <Button className="w-full bg-gradient-to-r from-primary to-blue-600">Get Started</Button>
                    </Link>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section
        className="pt-28 sm:pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          heroMouseX.set(e.clientX - rect.left)
          heroMouseY.set(e.clientY - rect.top)
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-indigo-50/50 dark:from-primary/10 dark:via-transparent dark:to-blue-900/10" />
        <DotGridBackground />
        {!reduce && (
          <motion.div aria-hidden className="hidden lg:block absolute inset-0 pointer-events-none" style={{ background: spotlightBackground }} />
        )}
        {/* Static, not animated — a blur-3xl filter forces a browser repaint
            on every single animated frame, and these ran on an infinite
            loop regardless of scroll position or visibility. Two of them
            running forever was real, constant main-thread/paint cost that
            competed with scroll compositing the whole time the page was
            open, which is what actually caused the scroll lag — the glow
            itself doesn't need to move to still look good. */}
        <div aria-hidden className="absolute -top-40 -right-40 w-80 h-80 bg-primary/30 rounded-full blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-600/30 rounded-full blur-3xl" />

        <motion.div
          className="relative max-w-7xl mx-auto"
          initial="hidden"
          animate="visible"
          variants={stagger(0.05, 0.12)}
        >
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column */}
            <div>
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-primary/20 rounded-full text-primary dark:text-blue-300 text-sm font-semibold mb-6">
                <Zap className="w-4 h-4" />
                Book trusted help, fast
              </motion.div>

              <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight mb-6">
                Home services,
                <span className="block bg-gradient-to-r from-primary via-blue-600 to-indigo-600 bg-clip-text text-transparent"> done right</span>
              </motion.h1>

              <motion.p variants={fadeUp} className="text-lg text-muted-foreground mb-8 max-w-xl leading-relaxed">
                SAJI connects you with verified electricians, plumbers, cleaners, and other service professionals, with secure M-Pesa/card payments and dispute protection on every booking.
              </motion.p>

              <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4">
                <Link href="/auth/signup">
                  <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Button size="lg" className={`relative overflow-hidden bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-white font-semibold gap-2 w-full sm:w-auto shadow-lg shadow-primary/20 ${reduce ? "" : "animate-shimmer"}`}>
                      Get Started <ArrowRight className="w-5 h-5" />
                    </Button>
                  </motion.div>
                </Link>
                <Link href="/auth/signup?role=provider">
                  <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Button size="lg" variant="outline" className="bg-transparent font-semibold w-full sm:w-auto">
                      Become a Provider
                    </Button>
                  </motion.div>
                </Link>
              </motion.div>

              {/* Trust Badge */}
              <motion.div variants={fadeUp} className="mt-10 flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Verified professionals, real reviews</p>
                  <p className="text-sm text-muted-foreground">Secure payments & dispute protection on every job</p>
                </div>
              </motion.div>

              {/* Hero photo — mobile/tablet only; a real image instead of
                  just icon cards, echoing the desktop column's photo below. */}
              <motion.div variants={fadeUp} className="relative mt-8 h-44 sm:h-56 rounded-2xl overflow-hidden shadow-xl lg:hidden">
                <KenBurnsImage src={HERO_IMAGE} alt="An electrician installing a fixture" className="absolute inset-0 w-full h-full object-cover" duration={16} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
              </motion.div>

              {/* Highlight cards — mobile/tablet only; the lg+ breakpoint gets
                  the same content as its own dedicated right-hand column
                  below instead, so this content isn't just dropped on
                  smaller screens. */}
              <motion.div variants={stagger(0.1, 0.08)} className="grid grid-cols-2 gap-3 mt-4 lg:hidden">
                {HERO_HIGHLIGHTS.map((item, i) => (
                  <motion.div key={i} variants={scaleIn} whileTap={{ scale: 0.97 }}>
                    <Card className="p-4 bg-card/50 border border-border backdrop-blur h-full">
                      <item.icon className="w-5 h-5 mb-2 text-primary" />
                      <p className="text-xs text-muted-foreground mb-0.5">{item.label}</p>
                      <p className="font-semibold text-foreground text-sm">{item.value}</p>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Right Column (lg+ only) — real photo behind the frosted-glass
                highlight cards, plus a small floating accent photo for depth. */}
            <div className="hidden lg:block relative">
              <div className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl">
                <KenBurnsImage src={HERO_IMAGE} alt="An electrician installing a fixture" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              </div>

              <motion.div variants={stagger(0.3, 0.08)} className="relative grid grid-cols-2 gap-4 p-5">
                {HERO_HIGHLIGHTS.map((item, i) => (
                  <motion.div key={i} variants={scaleIn} whileHover={{ y: -8, transition: HOVER_SPRING }}>
                    <Card className="p-6 bg-card/60 border border-white/20 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 transition-all backdrop-blur-md h-full">
                      <item.icon className="w-6 h-6 mb-3 text-primary" />
                      <p className="text-sm text-muted-foreground mb-1">{item.label}</p>
                      <p className="font-semibold text-foreground">{item.value}</p>
                    </Card>
                  </motion.div>
                ))}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: reduce ? 1 : 0.9, rotate: -6 }}
                animate={{ opacity: 1, scale: 1, rotate: -6 }}
                transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.5 }}
                whileHover={{ rotate: 0, scale: 1.05, transition: HOVER_SPRING }}
                className="absolute -bottom-8 -left-8 w-32 h-32 rounded-2xl overflow-hidden shadow-2xl border-4 border-background"
              >
                <img src={HERO_ACCENT_IMAGE} alt="An electrician, portrait" className="w-full h-full object-cover" />
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Category ticker — continuous motion visible the instant the page
          loads, no scroll or hover required. Real category data, duplicated
          once so translating exactly -50% loops with no visible seam. */}
      {categories.length > 0 && (
        <section aria-hidden={false} className="py-6 border-y border-border bg-card/50 overflow-hidden">
          <div
            className="relative"
            style={{
              maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
              WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
            }}
          >
            {reduce ? (
              <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 px-4">
                {categories.map((category) => {
                  const Icon = CATEGORY_ICON[category.slug] ?? BriefcaseBusiness
                  return (
                    <div key={category.id} className="flex items-center gap-2 text-muted-foreground">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">{category.name}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex w-max animate-marquee">
                {[...categories, ...categories].map((category, i) => {
                  const Icon = CATEGORY_ICON[category.slug] ?? BriefcaseBusiness
                  return (
                    <div key={`${category.id}-${i}`} className="flex items-center gap-2 px-6 whitespace-nowrap text-muted-foreground">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">{category.name}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Stats Section */}
      <section className="py-12 bg-card border-y border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {isLoadingLive ? (
            <StatsSectionSkeleton />
          ) : (
            <motion.div
              className="grid grid-cols-3 gap-8"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={stagger(0, 0.12)}
            >
              {benefits.map((item, i) => (
                <motion.div key={i} variants={fadeUp} className="text-center">
                  <p className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent mb-2">
                    <AnimatedNumber value={item.value} suffix="+" />
                  </p>
                  <p className="text-muted-foreground font-medium">{item.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
          >
            <SectionKicker>How It Works</SectionKicker>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Booked in four simple steps
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From searching for help to a job well done, here's the whole loop
            </p>
          </motion.div>

          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger(0, 0.12)}
          >
            {HOW_IT_WORKS.map((step, i) => {
              const Icon = step.icon
              return (
                <motion.div key={i} variants={fadeUp} className="relative">
                  {/* Connector line — desktop only, joins each step to the next */}
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div className="hidden lg:block absolute top-8 left-[calc(50%+2.5rem)] right-[calc(-50%+2.5rem)] h-px bg-gradient-to-r from-border to-border/0" />
                  )}
                  <motion.div whileHover={{ y: -8, transition: HOVER_SPRING }} className="relative text-center">
                    <div className="relative inline-flex mb-5">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-background border-2 border-primary text-primary text-xs font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed px-2">{step.description}</p>
                  </motion.div>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0">
          <KenBurnsImage src={FEATURES_BACKGROUND_IMAGE} alt="A power drill on a workbench" className="absolute inset-0 w-full h-full object-cover" duration={26} />
        </div>
        <div className="absolute inset-0 bg-background/55" />
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            className="text-center mb-16 mx-auto max-w-3xl bg-background/70 backdrop-blur-sm rounded-3xl px-6 py-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
          >
            <SectionKicker>Features</SectionKicker>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Everything you need, in one app
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From booking to payment to protection, SAJI handles the whole job
            </p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger(0, 0.1)}
          >
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon
              return (
                <motion.div key={i} variants={fadeUp} whileHover={{ y: -8, transition: HOVER_SPRING }}>
                  <Card className="p-8 border border-border hover:border-primary/50 hover:shadow-xl hover:shadow-primary/20 transition-all group h-full">
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-transform`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                  </Card>
                </motion.div>
              )
            })}
          </motion.div>
        </div>
      </section>

      {/* Audiences Section */}
      <section id="audiences" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30 relative overflow-hidden">
        <DotGridBackground />
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
          >
            <SectionKicker>Who It&apos;s For</SectionKicker>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Built for Everyone
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Whether you need help, offer it, or sell supplies, SAJI has a place for you
            </p>
          </motion.div>

          <motion.div
            className="grid md:grid-cols-3 gap-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger(0, 0.12)}
          >
            {AUDIENCES.map((audience, i) => (
              <motion.div key={i} variants={fadeUp} whileHover={{ y: -10, transition: HOVER_SPRING }}>
                <Card className="p-0 border border-border hover:border-primary hover:shadow-xl hover:shadow-primary/20 transition-all group relative overflow-hidden h-full">
                  <div className="relative h-40 overflow-hidden">
                    <img
                      src={audience.image}
                      alt={audience.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute top-0 right-0 w-28 h-28 bg-gradient-to-br from-primary/30 to-blue-600/30 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity" />
                    <motion.div
                      className="absolute bottom-3 left-4 w-11 h-11 rounded-full bg-white/95 shadow-lg flex items-center justify-center"
                      animate={ambient(reduce, { y: [0, -6, 0] })}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
                    >
                      <audience.icon className="w-5 h-5 text-primary" />
                    </motion.div>
                  </div>

                  <div className="relative p-8">
                    <h3 className="text-2xl font-bold text-foreground mb-3">{audience.name}</h3>
                    <p className="text-muted-foreground mb-6 leading-relaxed">{audience.description}</p>

                    <div className="space-y-2">
                      {audience.items.map((item) => (
                        <div key={item} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-primary" />
                          <span className="text-muted-foreground">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Service Categories */}
      <section id="categories" className="py-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            className="text-center mb-16"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
          >
            <SectionKicker>Services</SectionKicker>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Whatever the Job
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Real service categories, browsed and booked by real customers on SAJI today
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            {isLoadingLive ? (
              <motion.div key="skeleton" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <UseCasesSkeleton />
              </motion.div>
            ) : (
              <motion.div
                key="grid"
                className="grid grid-cols-2 md:grid-cols-4 gap-4"
                initial="hidden"
                animate="visible"
                variants={stagger(0, 0.05)}
              >
                {categories.map((category) => {
                  const Icon = CATEGORY_ICON[category.slug] ?? BriefcaseBusiness
                  return (
                    <motion.div key={category.id} variants={scaleIn} whileHover={{ y: -6, scale: 1.02, transition: HOVER_SPRING }}>
                      <Card className="p-6 border border-border hover:border-primary hover:shadow-xl hover:shadow-primary/20 transition-all text-center group cursor-pointer h-full">
                        <Icon className="w-8 h-8 mx-auto mb-3 text-primary group-hover:scale-110 transition-transform" />
                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{category.name}</p>
                      </Card>
                    </motion.div>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-3xl mx-auto">
          <motion.div
            className="text-center mb-12"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
          >
            <SectionKicker>FAQ</SectionKicker>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              Questions? Answered.
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              The things people ask us before their first booking
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
          >
            <Card className="p-2 sm:p-4 border border-border">
              <Accordion type="single" collapsible className="w-full">
                {FAQS.map((faq, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="px-4">
                    <AccordionTrigger className="text-base font-semibold text-foreground hover:no-underline">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0">
          <KenBurnsImage src={CTA_BACKGROUND_IMAGE} alt="A modern home exterior at dusk" className="absolute inset-0 w-full h-full object-cover" duration={24} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 to-blue-600/90" />
        {/* Same fix as the hero's pair — static instead of an infinite
            blur-3xl animation, see the comment there. */}
        <div aria-hidden className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl opacity-10" />
        <div aria-hidden className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl opacity-10" />

        <motion.div
          className="relative max-w-4xl mx-auto text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={stagger(0, 0.12)}
        >
          <motion.h2 variants={fadeUp} className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to get started?
          </motion.h2>
          <motion.p variants={fadeUp} className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Join SAJI today, book a trusted professional or start growing your service business
          </motion.p>
          <motion.div variants={fadeUp}>
            <Link href="/auth/signup">
              <motion.div className="inline-block" whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Button size="lg" variant="secondary" className={`relative overflow-hidden font-semibold gap-2 shadow-xl ${reduce ? "" : "animate-shimmer"}`}>
                  Create Your Account <ArrowRight className="w-5 h-5" />
                </Button>
              </motion.div>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Sticky mobile CTA — small screens don't have the nav's "Get
          Started" button in view once scrolled, so this keeps the primary
          action reachable without needing to scroll back up. */}
      <AnimatePresence>
        {scrolledPastHero && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="lg:hidden fixed bottom-0 inset-x-0 z-40 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
          >
            <Link href="/auth/signup">
              <Button size="lg" className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-700 text-white font-semibold gap-2">
                Get Started <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
