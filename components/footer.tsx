"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Mail, MapPin, Phone, Facebook, Twitter, Instagram, Linkedin } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { getPublicSiteSettings, type PublicSiteSettings } from "@/lib/actions/admin-settings"

const QUICK_LINKS = [
  { label: "Home", href: "/" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Features", href: "/#features" },
  { label: "Services", href: "/#categories" },
  { label: "Become a Provider", href: "/auth/signup?role=provider" },
]

const SUPPORT_LINKS = [
  { label: "FAQ", href: "/#faq" },
  { label: "Sign In", href: "/auth/login" },
  { label: "Create Account", href: "/auth/signup" },
]

const DEFAULT_SETTINGS: PublicSiteSettings = {
  logoUrl: null,
  supportEmail: "support@saji.app",
  supportPhone: "+254 700 000 000",
  address: "Nairobi, Kenya",
  socialLinks: { facebook: "", twitter: "", instagram: "", linkedin: "" },
}

export function Footer() {
  const [settings, setSettings] = useState<PublicSiteSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    let cancelled = false
    getPublicSiteSettings().then((s) => {
      if (!cancelled) setSettings(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Each platform's own brand color instead of a generic muted circle —
  // Instagram's is a gradient since that's its actual brand mark, not a
  // single flat color.
  const socials = [
    { key: "facebook", url: settings.socialLinks.facebook, icon: Facebook, label: "Facebook", brand: "bg-[#1877F2]" },
    { key: "twitter", url: settings.socialLinks.twitter, icon: Twitter, label: "Twitter", brand: "bg-black" },
    { key: "instagram", url: settings.socialLinks.instagram, icon: Instagram, label: "Instagram", brand: "bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888]" },
    { key: "linkedin", url: settings.socialLinks.linkedin, icon: Linkedin, label: "LinkedIn", brand: "bg-[#0A66C2]" },
  ].filter((s) => s.url)

  return (
    <footer className="border-t border-border bg-card mt-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BrandLogo size="large" />
              <span className="font-bold text-lg">SAJI</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Connecting you with trusted, verified service providers across Kenya.
            </p>
            {socials.length > 0 && (
              <div className="flex items-center gap-2 pt-1">
                {socials.map((s) => (
                  <a
                    key={s.key}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-transform hover:scale-110 ${s.brand}`}
                  >
                    <s.icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Quick Links</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {QUICK_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-foreground transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Support</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="hover:text-foreground transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Contact</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <a href={`mailto:${settings.supportEmail}`} className="hover:text-foreground transition-colors">
                  {settings.supportEmail}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <Phone className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <a href={`tel:${settings.supportPhone.replace(/[^+\d]/g, "")}`} className="hover:text-foreground transition-colors">
                  {settings.supportPhone}
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{settings.address}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} SAJI. All rights reserved.</p>
            <div className="flex gap-6">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
