"use client"

import { Shield, Clock, TrendingUp, Zap, Lock, Users } from "lucide-react"

const features = [
  {
    icon: Shield,
    title: "Verified Providers",
    description: "All service providers are thoroughly vetted and verified for your safety and peace of mind.",
  },
  {
    icon: Lock,
    title: "Secure Payments",
    description: "Pay safely using M-Pesa, bank cards, PayPal and more. Escrow protection for every transaction.",
  },
  {
    icon: Clock,
    title: "Real-time Updates",
    description: "Track your job progress in real-time with instant notifications and status updates.",
  },
  {
    icon: Zap,
    title: "Fast & Easy",
    description: "Book a service in minutes. Simple interface designed for mobile-first experience.",
  },
  {
    icon: TrendingUp,
    title: "Transparent Pricing",
    description: "No hidden fees. Know exactly what you'll pay before confirming your booking.",
  },
  {
    icon: Users,
    title: "Community Trust",
    description: "Read real reviews from verified users. Support local service providers in your area.",
  },
]

export function FeaturesSection() {
  return (
    <section className="py-20 md:py-32 bg-card/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Why Choose SAJI?</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            We combine trust, technology, and convenience to deliver the best service experience.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <div
                key={index}
                className="p-8 rounded-2xl border border-border bg-background hover:border-primary/50 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
