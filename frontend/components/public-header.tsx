import Link from "next/link"
import { ArrowUpRight, ChevronDown } from "lucide-react"
import { BrandLogo } from "@/frontend/components/brand-logo"
import { MobileHomeMenu } from "@/frontend/components/pages/mobile-home-menu"
import { OFFERING_LINKS } from "@/backend/domain/public-site"
import styles from "./pages/information-home.module.css"

export function PublicHeader() {
  return <header id="home-top" tabIndex={-1} className={`${styles.header} ${styles.publicHeader}`}>
    <nav className={styles.nav} aria-label="Main navigation">
      <Link href="/" className={styles.logo} aria-label="MySaji home"><BrandLogo size="default" /><span>MySaji<span>Everyday life. Everyday business.</span></span></Link>
      <div className={styles.navLinks}>
        <details className={styles.exploreMenu}><summary>Explore MySaji <ChevronDown size={15} aria-hidden="true" /></summary><div>{OFFERING_LINKS.map(link => <Link key={link.href} href={link.href}>{link.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}</div></details>
        <Link href="/pro">Saji Pro</Link><Link href="/pos">Saji Till</Link><Link href="/knowledge">Help & guides</Link>
      </div>
      <div className={styles.navActions}><Link href="/auth/login">Sign in</Link><Link href="/auth/signup" className={styles.buttonSmall}>Join MySaji <ArrowUpRight size={16} aria-hidden="true" /></Link><MobileHomeMenu /></div>
    </nav>
  </header>
}
