import { Suspense } from "react"
import BookingConfirmationContent from "./confirmation-content"

export default function BookingConfirmationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BookingConfirmationContent />
    </Suspense>
  )
}
