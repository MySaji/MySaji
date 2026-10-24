import Link from "next/link"
import { ArrowLeft, ArrowUpRight, Check, ShoppingBag, ShieldCheck, Boxes, Users } from "lucide-react"
import type { ReactNode } from "react"
import { BrandLogo } from "@/frontend/components/brand-logo"
import styles from "./auth-frame.module.css"

type AuthFrameProps = {
  mode: "login" | "owner" | "employee"
  step: number
  children: ReactNode
}

export function AuthFrame({ mode, step, children }: AuthFrameProps) {
  const signup = mode !== "login"
  const employee = mode === "employee"
  const steps = signup ? ["Your details", "Verify contact", "Set password"] : ["Your account", "Verify & sign in"]
  return (
    <main className={styles.page}>
      <aside className={styles.story}>
        <Link href="/pos" className={styles.brand}><span><BrandLogo size="default" /></span>saji <em>till</em></Link>
        <div className={styles.storyContent}>
          <p className={styles.eyebrow}>{employee ? "YOUR TEAM. YOUR PLACE." : signup ? "THE NEXT CHAPTER OF YOUR BUSINESS" : "GOOD TO HAVE YOU BACK"}</p>
          <h2>{employee ? <>Your own login.<br />{" "}Your part of<br />{" "}<i>the business.</i></> : signup ? <>Big plans.<br />{" "}Small beginnings.<br />{" "}<i>Your own till.</i></> : <>Another day.<br />{" "}A fresh start.<br />{" "}<i>Let’s open up.</i></>}</h2>
          <p className={styles.storyDescription}>{employee ? "Join the shop that invited you. Your employer sets your branch, role and the features you can use." : signup ? "Put your sales, stock and team in one place. Start with the essentials and build from there." : "Your products, your people and the day ahead. Everything is right where you left it."}</p>
          <div className={styles.dayCard}>
            <div className={styles.dayCardHeading}><ShoppingBag size={18} /><strong>{employee ? "A workspace that fits your role" : "A little more order, every day."}</strong></div>
            {(employee ? [[Users, "One account, just for you"], [ShieldCheck, "Access chosen by your employer"], [Check, "No business setup required"]] : [[ShoppingBag, "A counter ready for the everyday rush"], [Boxes, "Stock records you can keep an eye on"], [Users, "The right access for every employee"]]).map(([Icon, label]) => { const ItemIcon = Icon as typeof Users; return <div className={styles.dayItem} key={String(label)}><ItemIcon size={16} /><span>{String(label)}</span></div> })}
          </div>
        </div>
        <div className={styles.storyFooter}><span>Made for your working day.</span><Link href="/pos/contact">Talk to us <ArrowUpRight size={14} /></Link></div>
      </aside>
      <section className={styles.formSide} aria-label={signup ? "Create your Till account" : "Sign in to Till"}>
        <div className={styles.topline}><Link href="/pos"><ArrowLeft size={15} /> Back to Till</Link><span>{signup ? "Already registered?" : "New to Till?"} <Link href={signup ? "/pos/login" : "/pos/signup"}>{signup ? "Sign in" : "Create an account"}<ArrowUpRight size={13} /></Link></span></div>
        <div className={styles.formCenter}>
          <div className={styles.progress} aria-label={`Step ${step + 1} of ${steps.length}: ${steps[step]}`}>
            {steps.map((label, index) => <div key={label} className={index <= step ? styles.currentStep : undefined} aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={12} /> : index + 1}</span><small>{label}</small></div>)}
          </div>
          <div className={styles.form}>{children}</div>
          <div className={styles.support}><ShieldCheck size={15} /><span>Keep your password and verification codes private.</span></div>
        </div>
        <footer className={styles.formFooter}><Link href="/">Back to MySaji main website</Link><Link href="/pos/contact">Need a hand?</Link></footer>
      </section>
    </main>
  )
}
