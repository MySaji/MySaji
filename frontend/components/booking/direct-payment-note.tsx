/**
 * What a customer is told when SAJI is not taking the money.
 *
 * Shared rather than repeated. It appeared on the booking wizard first, and
 * the quick-book and emergency flows were still sending people to a payment
 * step that could never complete. Three copies of this wording would have
 * drifted, and this is the one paragraph in the flow that has to be exactly
 * right: it is the whole explanation of why nobody is asking for money.
 *
 * It says what is NOT happening ("nothing is charged now", "SAJI does not
 * hold your money") because the thing a customer actually worries about at
 * this moment is having paid into a void. Saying only "pay later" leaves
 * that unanswered.
 */
export function DirectPaymentNote({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4">
      <p className={compact ? "text-xs font-semibold text-foreground" : "text-sm font-semibold text-foreground"}>
        You pay the provider directly
      </p>
      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
        Nothing is charged now and SAJI does not hold your money. Agree the final amount with
        the provider, and pay them on their phone once the work is done and you are happy with
        it.
      </p>
      {!compact && (
        <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
          Paying inside the app is coming soon.
        </p>
      )}
    </div>
  )
}
