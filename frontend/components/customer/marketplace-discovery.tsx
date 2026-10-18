"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, ChevronLeft, ChevronRight, Loader2, MessageCircle, Package, Plus, Sparkles, Wrench } from "lucide-react"
import { useActiveBanners } from "@/frontend/lib/hooks/useActiveBanners"
import { getProducts } from "@/backend/actions/products"
import { addToCart } from "@/backend/actions/cart"
import { revalidateCartCount } from "@/frontend/lib/hooks/useCartCount"
import { useLocalization } from "@/frontend/lib/hooks/useLocalization"
import styles from "./marketplace-discovery.module.css"

export function MarketplaceCampaigns() {
  const { banners, index, goTo, paused, setPaused } = useActiveBanners("HOME_HERO")
  const fallback = [
    { id: "home", title: "A little help. A better day.", subtitle: "Find a professional for the jobs that keep your home running.", imageUrl: "/plumbing-repair.jpg", linkUrl: "/customer/services" },
    { id: "shop", title: "Your next find is closer than you think.", subtitle: "Explore products and shops. Check availability, prices and delivery before you order.", imageUrl: "/home-cleaning-tools.png", linkUrl: "/customer/products" },
    { id: "work", title: "Big job? Start with a clear request.", subtitle: "Describe the work, compare the details and keep your quote in one place.", imageUrl: "/house-moving.jpg", linkUrl: "/customer/service-requests/new" },
  ]
  const [fallbackIndex, setFallbackIndex] = useState(0)
  const items = banners.length ? banners : fallback
  const active = banners.length ? index : fallbackIndex
  const campaign = items[active] ?? items[0]
  const move = (next: number) => banners.length ? goTo(next) : setFallbackIndex((next + items.length) % items.length)
  return <section className={styles.campaignGrid} aria-label="Discover MySaji">
    <div className={styles.campaign}>
      <div className={styles.campaignCopy}><span className={styles.kicker}>MAKE MORE OF YOUR DAY</span><h2>{campaign.title}</h2><p>{campaign.subtitle}</p><Link href={campaign.linkUrl || "/customer/services"}>Explore now <ArrowRight size={16} /></Link><div className={styles.controls}><button type="button" onClick={() => move(active - 1)} aria-label="Previous campaign"><ChevronLeft size={17} /></button><span aria-live="polite">{active + 1} / {items.length}</span>{banners.length > 1 && <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? "Resume campaign rotation" : "Pause campaign rotation"}>{paused ? "Play" : "Pause"}</button>}<button type="button" onClick={() => move(active + 1)} aria-label="Next campaign"><ChevronRight size={17} /></button></div></div>
      <div className={styles.campaignImage}><Image src={campaign.imageUrl} alt="" fill sizes="(max-width: 640px) 45vw, 450px" priority className="object-cover" /></div>
    </div>
    <div className={styles.sidePromos}><Link href="/customer/products"><Package size={25} /><span>Something for your everyday</span><strong>Browse products</strong><ArrowRight size={18} /></Link><Link href="/customer/find-now"><Wrench size={25} /><span>Need help nearby?</span><strong>Find a professional</strong><ArrowRight size={18} /></Link></div>
  </section>
}

export function AssistantIdeas() {
  const prompts = ["Help me describe a plumbing repair so I can request an accurate quote.", "What should I compare before booking a cleaner?", "Help me plan a move and list what to ask a moving company.", "What should I check before renting equipment?", "Help me understand my booking’s next steps.", "What questions should I ask before choosing a service provider?"]
  return <section className={styles.assistant}><div className={styles.assistantTitle}><span><Sparkles size={21} /></span><div><h2>A useful starting point, with a little AI help.</h2><p>Choose a question to draft in your assistant. Review it, then send when you’re ready.</p></div></div><div className={styles.promptGrid}>{prompts.map(prompt => <button key={prompt} type="button" onClick={() => window.dispatchEvent(new CustomEvent("saji:ask-assistant", { detail: { prompt } }))}><MessageCircle size={16} /><span>{prompt}</span><ArrowRight size={15} /></button>)}</div><p className={styles.assistantNote}>Suggestions help you prepare. Confirm prices, availability and scope with the actual listing or professional.</p></section>
}

export function HomeProductGrid() {
  const { formatMoney } = useLocalization()
  const { data: products, isLoading, error, mutate } = useSWR("customer-home-products", () => getProducts({ take: 12, sortBy: "recent" }))
  const [adding, setAdding] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const add = async (id: string) => {
    if (adding) return
    setAdding(id); setMessage("")
    try { const result = await addToCart({ productId: id, quantity: 1 }); if (result.success) { revalidateCartCount(); setMessage("Added to your cart. Review your items when ready.") } else setMessage(result.error || "Could not add this item.") }
    catch { setMessage("Could not add the item. Please try again.") }
    finally { setAdding(null) }
  }
  return <section className={styles.productSection}><div className={styles.sectionTitle}><div><span className={styles.kicker}>FRESH FROM THE CATALOGUE</span><h2>Products to explore</h2></div><Link href="/customer/products">Shop all <ArrowRight size={16} /></Link></div>{message && <p role="status" className={styles.feedback}>{message} <Link href="/customer/cart">View cart</Link></p>}{error ? <div className={styles.feedback}>Products could not load. <button onClick={() => void mutate()}>Try again</button></div> : isLoading ? <div className={styles.productGrid}>{Array.from({length:6},(_,index)=><div key={index} className="h-60 animate-pulse rounded-xl bg-muted" />)}</div> : !products?.length ? <div className={styles.empty}><Package size={26} /><h3>There’s more to discover.</h3><p>Products appear here when shops publish their catalogue.</p><Link href="/customer/shops">Explore shops <ArrowRight size={16} /></Link></div> : <div className={styles.productGrid}>{products.map(product => <article key={product.id}><Link href={`/customer/products/${product.id}`} className={styles.productImage}><Image src={product.image || "/placeholder.svg"} alt={product.name} fill sizes="(max-width:640px) 45vw, 230px" className="object-contain" />{product.discountPrice != null && product.discountPrice < product.price && <span>Special price</span>}</Link><div className={styles.productInfo}><span>{product.shop}</span><Link href={`/customer/products/${product.id}`}><h3>{product.name}</h3></Link><strong>{formatMoney(product.discountPrice ?? product.price)}</strong>{product.discountPrice != null && product.discountPrice < product.price && <del>{formatMoney(product.price)}</del>}<button type="button" disabled={adding !== null || product.stock <= 0} onClick={() => void add(product.id)} aria-label={`Add ${product.name} to cart`}>{adding === product.id ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />}{product.stock > 0 ? "Add to cart" : "Out of stock"}</button></div></article>)}</div>}</section>
}
