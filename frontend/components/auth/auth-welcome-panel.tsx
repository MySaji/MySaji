"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, ShoppingBag, BriefcaseBusiness } from "lucide-react"
import { BrandLogo } from "@/frontend/components/brand-logo"

export function AuthWelcomePanel({ mode }: { mode: "login" | "signup" }) {
  const [audience, setAudience] = useState<"customer" | "pro">("customer")
  const customer = audience === "customer"
  return <aside className="auth-welcome">
    <Link href="/" className="auth-brand"><BrandLogo size="large" /><span>My<span>Saji</span></span></Link>
    <div className="auth-story">
      <p className="auth-eyebrow">EVERYDAY NEEDS. LOCAL EXPERTISE.</p>
      <h1>{mode === "login" ? "Your next good connection starts here." : "A little help. A new opportunity. A place to begin."}</h1>
      <p>Find what you need, connect with people who can help, and keep the details together.</p>
      <div role="group" aria-label="Explore account benefits" className="auth-audience">
        <button type="button" aria-pressed={customer} onClick={() => setAudience("customer")}><ShoppingBag size={17} />For customers</button>
        <button type="button" aria-pressed={!customer} onClick={() => setAudience("pro")}><BriefcaseBusiness size={17} />For Saji Pro</button>
      </div>
      <div className="auth-benefits" aria-live="polite">
        <span className="auth-eyebrow">{customer ? "MAKE ROOM FOR WHAT MATTERS" : "GIVE YOUR WORK A HOME"}</span>
        <h2>{customer ? "From finding it to getting it done." : "Your skills. Your shop. Your next customer."}</h2>
        {(customer ? ["Explore services and products in one place", "Discuss the details before you book", "Follow your orders, requests and conversations"] : ["Showcase your services, products and experience", "Manage enquiries, quotes and customer conversations", "Keep jobs and business activity organised"]).map(text => <p key={text}><Check size={17} aria-hidden="true" />{text}</p>)}
        <Link href={customer ? "/knowledge/customer-bookings" : "/knowledge/provider-guide"}>See how it works <ArrowRight size={16} /></Link>
      </div>
    </div>
    <nav aria-label="Account help"><Link href="/knowledge/support">Need a hand?</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav>
  </aside>
}

export function AuthJourney({ mode, step }: { mode: "login" | "signup"; step: string }) {
  const current = mode === "login" ? (step === "otp" ? 1 : 0) : step === "role" || step === "proSetup" || step === "posShopType" ? 0 : step === "details" ? 1 : step === "otp" ? 2 : 3
  const steps = mode === "login" ? ["Your account", "Verify & continue"] : ["Choose account", "Your details", "Verify", "Secure account"]
  return <ol className="auth-journey" aria-label={mode === "login" ? "Sign in progress" : "Sign up progress"}>{steps.map((label, index) => <li key={label} aria-current={current === index ? "step" : undefined} data-complete={index < current}><span>{index < current ? <Check size={12} /> : index + 1}</span>{label}</li>)}</ol>
}
