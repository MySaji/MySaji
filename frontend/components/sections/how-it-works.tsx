"use client"

import { CheckCircle } from "lucide-react"

const steps = [
  {
    number: 1,
    title: "Search & Browse",
    description: "Find the service you need by searching or browsing our categories.",
  },
  {
    number: 2,
    title: "Select Provider",
    description: "Compare providers by ratings, experience, and price to find the perfect match.",
  },
  {
    number: 3,
    title: "Secure Payment",
    description: "Book and pay securely using your preferred payment method with escrow protection.",
  },
  {
    number: 4,
    title: "Service Delivery",
    description: "Track your job in real-time as the provider completes your request.",
  },
  {
    number: 5,
    title: "Confirmation",
    description: "Verify the work is complete and release payment to the provider.",
  },
  {
    number: 6,
    title: "Review & Rate",
    description: "Share your experience and help other users find great service providers.",
  },
]

export function HowItWorks() {
  return (
    <section className="py-20 md:py-32 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">How It Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Six simple steps to get your service done with confidence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-4">
              {/* Number Circle */}
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold text-lg">
                  {step.number}
                </div>
              </div>

              {/* Content */}
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Benefits Bar */}
        <div className="mt-16 p-8 rounded-2xl bg-card border border-border">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { label: "Verified Providers", value: "100%" },
              { label: "Protected Payments", value: "Always" },
              { label: "Money-back Guarantee", value: "30 Days" },
            ].map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                <CheckCircle className="w-6 h-6 text-primary flex-shrink-0" />
                <div>
                  <p className="text-2xl font-bold text-foreground">{item.value}</p>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
