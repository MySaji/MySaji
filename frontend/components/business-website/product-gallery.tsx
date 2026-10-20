"use client"
import { useMemo, useState } from "react"
import type { PublicBusinessWebsite } from "@/backend/services/pos-public-website"
import styles from "./website.module.css"

export function WebsiteProductGallery({ products, currency, contactHref }: { products: PublicBusinessWebsite["products"]; currency: string; contactHref: string }) {
  const [query, setQuery] = useState("")
  const [kind, setKind] = useState("all")
  const visible = useMemo(() => products.filter(p => (kind === "all" || (kind === "services") === p.isService) && `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase().trim())), [products, query, kind])
  const money = (value: number) => { try { return new Intl.NumberFormat("en-KE", { style: "currency", currency }).format(value) } catch { return `${currency} ${value.toFixed(2)}` } }
  return <div><div className={styles.filters}><label>Find an item<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search this selection" /></label><label>Show<select value={kind} onChange={e => setKind(e.target.value)}><option value="all">Products & services</option><option value="products">Products</option><option value="services">Services</option></select></label><p role="status">{visible.length} item{visible.length === 1 ? "" : "s"}</p></div>
    <div className={styles.productGrid}>{visible.map(product => <article key={product.id} className={styles.product}><div className={styles.productImage}>{product.image ? <img src={product.image} alt={product.name} loading="lazy" /> : <span aria-hidden="true">{product.name.slice(0, 1)}</span>}</div><div className={styles.productBody}><p className={styles.kicker}>{product.isService ? "Service" : "Product"}</p><h3>{product.name}</h3><p className={styles.productDescription}>{product.description}</p><p className={styles.price}>{money(product.price)}<small>{!product.isService && product.unit ? ` / ${product.unit}` : ""}</small></p><a href={contactHref}>Ask about this item <span aria-hidden="true">↗</span></a></div></article>)}</div>
    {visible.length === 0 && <p className={styles.empty}>No items match your search. Try another name or contact the business.</p>}<p className={styles.note}>Prices are shown from the business catalogue. Contact the business to confirm availability and final order details.</p>
  </div>
}
