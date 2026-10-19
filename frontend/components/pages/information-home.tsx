import Link from "next/link"
import Image from "next/image"
import { ArrowRight, ArrowUpRight, BookOpen, Boxes, CalendarCheck, Check, ChevronDown, KeyRound, MessageCircle, ShieldCheck, ShoppingBag, Store, Truck, Users, Wallet, Wrench } from "lucide-react"
import { KnowledgeSearch } from "@/frontend/components/knowledge-search"
import { PublicHeader } from "@/frontend/components/public-header"
import { OFFERING_LINKS } from "@/backend/domain/public-site"
import { BackToTop } from "./back-to-top"
import PublicChatButton from "@/frontend/components/public-chat-button"
import styles from "./information-home.module.css"

const pathways = [
  { icon: Wrench, title: "Get a job off your list.", label: "FOR EVERYDAY LIFE", body: "Find services, compare the scope and price, and book the work you need. Keep the conversation and booking details together.", items: ["Home repairs & maintenance", "Cleaning & moving", "Professional services"], href: "/work", action: "Explore services & bookings" },
  { icon: Users, title: "Put your skills to work.", label: "FOR PROFESSIONALS", body: "Give customers a clear picture of what you do. Build your profile, publish offers and manage work through Saji Pro.", items: ["Service profiles & offers", "Quotes & customer requests", "Messages & job records"], href: "/pro", action: "Get to know Saji Pro" },
  { icon: ShoppingBag, title: "Bring your shop online.", label: "FOR SHOPS & CUSTOMERS", body: "Organise products into a useful catalogue. Keep prices and availability current, and manage customer orders from your workspace.", items: ["Products & storefronts", "Customer orders", "Fulfilment records"], href: "/shop", action: "Explore shops & orders" },
  { icon: Truck, title: "Keep businesses supplied.", label: "FOR DISTRIBUTORS", body: "List wholesale products and manage procurement requests. Keep track of the details business buyers need before placing an order.", items: ["Wholesale catalogues", "Business buying requests", "Supply locations"], href: "/knowledge/distributors", action: "See the distributor guide" },
]
const questions = [
  ["Where should I start?", "Create a customer account if you want to book services or place orders. Choose a professional or business account if you want to offer services, sell products or supply businesses. Saji Till has its own signup for shop owners and invited employees."],
  ["Is Saji Till separate from Saji Pro?", "Yes. Till has a dedicated signup, login and POS workspace. You can use it for counter sales, stock and employee access without setting up a professional services profile. Saji Pro is the workspace for offering and managing services."],
  ["What does verification mean?", "Verification checks the information or documents requested for an account or activity. Check the details shown on an individual profile and read the service scope before booking. Verification is not a guarantee of the quality or outcome of a job."],
  ["How do I know what I’ll pay?", "Review the price, scope, fees and payment summary before confirming a transaction. For business subscriptions, check the current plan in your workspace or ask the team. Features and payment methods depend on your account and setup."],
  ["What if a booking changes?", "Keep the discussion and any evidence in the job record. Review the available cancellation or dispute options for that booking, and use the help guides when you need support."],
]

export function InformationHome() {
  return <div className={styles.home}>
    <PublicHeader />

    <section className={`${styles.hero} ${styles.container}`}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}><span /> BUILT AROUND YOUR EVERYDAY</p>
        <h1>Shop, book services<br />and run your business<br /><em>with MySaji.</em></h1>
        <p className={styles.intro}>Find help for your home. Make room for your next customer. Run the shop you’ve worked hard to build. There’s a place for you on MySaji.</p>
        <div className={styles.actions}><Link href="/auth/signup" className={styles.primary}>Find your place <ArrowRight size={18} /></Link><a href="#explore" className={styles.textLink}>See what you can do <ArrowRight size={17} /></a></div>
        <p className={styles.heroFoot}>For customers, independent professionals and growing businesses in Kenya.</p>
      </div>
      <div className={styles.heroVisual}>
        <div className={styles.imageFrame}><Image src="/plumbing-repair.jpg" alt="A tradesperson repairing a tap at a kitchen sink" width={1024} height={1024} priority sizes="(max-width: 800px) 100vw, 45vw" /><div className={styles.imageCaption}><Wrench size={17} /><span>For the work that makes<br /><strong>everyday life work.</strong></span></div></div>
        <div className={styles.note}><span className={styles.noteIcon}><CalendarCheck size={20} /></span><div><strong>From “I need a hand”</strong><span>to a plan you can follow.</span></div><ArrowUpRight size={19} /></div>
        <span className={styles.photoLabel}>Services, shops & business tools. Together.</span>
      </div>
    </section>

    <div className={styles.pillars}><div className={styles.container}>{[["Shop", "Find products & manage orders", "/knowledge/shops-orders"], ["Work", "Offer skills & book services", "/knowledge/provider-guide"], ["Rent", "Understand equipment hire", "/knowledge/rentals"], ["Learn", "Get a clear answer", "/knowledge"], ["Grow", "Give your business better tools", "/pos"]].map(([label, body, href]) => <Link key={label} href={href}><strong>{label}<ArrowUpRight size={15} /></strong><span>{body}</span></Link>)}</div></div>

    <nav aria-label="Explore MySaji offerings" className={styles.offeringLinks}>{OFFERING_LINKS.map(link => <Link key={link.href} href={link.href}><strong>{link.shortLabel}</strong><span>{link.label}</span><ArrowUpRight size={16} aria-hidden="true" /></Link>)}</nav>

    <section id="explore" className={`${styles.container} ${styles.section}`}>
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>DIFFERENT DAYS. ONE STARTING POINT.</p><h2>What’s on<br />your list today?</h2></div><p>Some days you need a reliable pair of hands. Other days you’re the person getting the job done. Pick the part of MySaji that fits.</p></div>
      <div className={styles.pathGrid}>{pathways.map(path => <article key={path.title}><div className={styles.pathTop}><path.icon size={25} /><span>{path.label}</span></div><h3>{path.title}</h3><p>{path.body}</p><ul>{path.items.map(item => <li key={item}><Check size={14} />{item}</li>)}</ul><Link href={path.href}>{path.action}<ArrowUpRight size={17} /></Link></article>)}</div>
    </section>

    <section className={styles.workflow}><div className={`${styles.container} ${styles.workflowInner}`}><div><p className={styles.eyebrow}>KNOW WHAT HAPPENS NEXT</p><h2>A little clarity<br />goes a long way.</h2><p>Good work starts with the right details. MySaji gives you a place to agree on them and a record to come back to.</p><Link href="/knowledge/getting-started" className={styles.textLink}>How MySaji works <ArrowRight size={17} /></Link></div><ol>{[["Find the right fit", "Compare profiles, service areas and what’s included. Explain what you need before agreeing to the work."], ["Agree on the details", "Review the time, scope, price and payment summary. Keep any changes in the booking workflow."], ["Keep the story together", "Use messages, job updates and transaction records to follow progress and handle the next step."]].map(([title, body], index) => <li key={title}><span>0{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol></div></section>

    <section className={`${styles.container} ${styles.section}`}>
      <div className={styles.tillFeature}><div className={styles.tillCopy}><p className={styles.eyebrow}>MEET SAJI TILL</p><h2>Your counter.<br />Your team.<br /><em>Your business.</em></h2><p>A dedicated point of sale for the working day. Ring up a sale, keep stock records in order and know what the drawer should hold when you close.</p><div className={styles.actions}><Link href="/pos" className={styles.primary}>Take a look at Till <ArrowRight size={18} /></Link><Link href="/pos/login" className={styles.textLink}>Till sign in <ArrowUpRight size={16} /></Link></div><p className={styles.tillFoot}>Own signup. Own workspace. No Saji Pro profile needed.</p></div><div className={styles.tillTools}><div className={styles.tillLabel}><Store size={20} /><span>THE SHOP, A LITTLE MORE SORTED.</span></div>{[{ icon: ShoppingBag, title: "A smoother checkout", body: "Barcode scanning, split payments and itemised receipts." }, { icon: Boxes, title: "Stock you can follow", body: "Products, deliveries, counts and trade-specific tracking." }, { icon: Users, title: "A place for your team", body: "Individual employee access and features chosen by the owner." }, { icon: Wallet, title: "An end-of-day picture", body: "Shift cash counts, sales reports and payment records." }].map(tool => <div key={tool.title}><tool.icon size={21} /><span><strong>{tool.title}</strong><p>{tool.body}</p></span></div>)}<Link href="/pos/signup">Set up a shop workspace <ArrowUpRight size={16} /></Link></div></div>
    </section>

    <section className={styles.moreSection}><div className={`${styles.container} ${styles.section}`}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>THERE’S MORE TO THE WORKING DAY</p><h2>For the details<br />between the big steps.</h2></div><p>From a quote that needs checking to a tool you only need for a week, find the workflow that matches the job.</p></div><div className={styles.moreGrid}>{[{ icon: KeyRound, title: "Rent, with the details clear", body: "Understand equipment rental periods, availability, deposits and returns before you confirm.", href: "rentals", link: "Equipment rental guide" }, { icon: MessageCircle, title: "Keep the conversation close", body: "Coordinate timing and location in messages, and return to the booking record for agreed changes.", href: "messaging-calls", link: "Messages & coordination" }, { icon: BookOpen, title: "Put the quote in writing", body: "Review the scope, line items and terms. Keep quotes and invoices connected to the work.", href: "quotes-invoices", link: "Quotes & invoices" }].map(item => <article key={item.title}><item.icon size={24} /><h3>{item.title}</h3><p>{item.body}</p><Link href={`/knowledge/${item.href}`}>{item.link}<ArrowUpRight size={16} /></Link></article>)}</div></div></section>

    <section id="handbook" className={`${styles.container} ${styles.section}`}><div className={styles.helpGrid}><div><p className={styles.eyebrow}>A HANDBOOK, NOT A GUESSING GAME</p><h2>Before you click<br />“confirm”, get clear.</h2><p>Search practical guides on accounts, bookings, payments and running your business. A useful answer should be easy to find.</p><Link href="/knowledge" className={styles.textLink}>Open the knowledge base <ArrowRight size={17} /></Link><div className={styles.safetyNote}><ShieldCheck size={22} /><p><strong>Take a closer look.</strong> Read profile details and service terms. Check what verification covers, and keep your account access private.</p></div></div><div className={styles.searchArea}><KnowledgeSearch compact /></div></div></section>

    <section className={styles.faqSection}><div className={`${styles.container} ${styles.section}`}><div className={styles.faqGrid}><div><p className={styles.eyebrow}>LET’S CLEAR A FEW THINGS UP</p><h2>New here?<br />Start with these.</h2><Link href="/knowledge/support" className={styles.textLink}>More help & support <ArrowUpRight size={17} /></Link></div><div className={styles.faqs}>{questions.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={18} /></summary><p>{answer}</p></details>)}</div></div></div></section>

    <section className={styles.closing}><div className={styles.container}><div><p className={styles.eyebrow}>YOUR NEXT STEP IS A GOOD PLACE TO START.</p><h2>Make a little progress today.</h2></div><div className={styles.actions}><Link href="/auth/signup" className={styles.primary}>Join MySaji <ArrowRight size={18} /></Link><Link href="/auth/login" className={styles.textLink}>Already here? Sign in <ArrowUpRight size={16} /></Link></div></div></section>
    <BackToTop />
    <PublicChatButton />
  </div>
}
