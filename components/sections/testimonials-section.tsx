"use client"

import { Card } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Star } from "lucide-react"

const testimonials = [
  {
    name: "Sarah Johnson",
    role: "Business Owner",
    avatar: "/placeholder-user.jpg",
    rating: 5,
    text: "SAJI made it incredibly easy to find a reliable electrician. The payment was secure and the service was exactly as promised.",
  },
  {
    name: "David Kipchoge",
    role: "Homeowner",
    avatar: "/placeholder-user.jpg",
    rating: 5,
    text: "As a provider, I've earned consistent income through SAJI. The platform is transparent, fair, and very easy to use.",
  },
  {
    name: "Maria Garcia",
    role: "Property Manager",
    avatar: "/placeholder-user.jpg",
    rating: 5,
    text: "We manage multiple properties and SAJI has become our go-to for maintenance services. Reliable, affordable, and professional.",
  },
]

export function TestimonialsSection() {
  return (
    <section className="py-20 md:py-32 bg-card/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-4">Loved by Users & Providers</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Thousands of successful connections and satisfied customers every day.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card key={index} className="p-8">
              {/* Stars */}
              <div className="flex gap-1 mb-4">
                {[...Array(testimonial.rating)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-secondary text-secondary" />
                ))}
              </div>

              {/* Text */}
              <p className="text-foreground mb-6 leading-relaxed">"{testimonial.text}"</p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={testimonial.avatar || "/placeholder.svg"} />
                  <AvatarFallback>{testimonial.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-foreground text-sm">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
