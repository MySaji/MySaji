import { Suspense } from "react"
import BookingContent from "./booking-content"

export default function BookingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BookingContent />
    </Suspense>
  )
}
