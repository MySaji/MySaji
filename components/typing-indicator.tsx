/**
 * The three bouncing dots a chat shows while the other side composes a reply.
 *
 * Both chatbot widgets previously showed a spinner labelled "Sending..." /
 * "Thinking...", which read as "your message is still going out" — but the
 * user's message is already on screen by then (it is added optimistically),
 * so what the wait actually represents is the assistant typing. Dots say that
 * without words, and are what people expect from a chat.
 *
 * The stagger comes from negative animation delays so all three are already
 * mid-cycle on the first frame, rather than starting flat and drifting apart.
 */
export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-current opacity-60"
          style={{ animation: "saji-typing 1.2s ease-in-out infinite", animationDelay: `${i * 0.16 - 1.2}s` }}
        />
      ))}
    </span>
  )
}

/**
 * The whole bubble, so both widgets show the same thing.
 *
 * `label` is what a screen reader announces and is deliberately not painted:
 * a sighted user reads the dots, and a caption beside them just adds noise to
 * a bubble that exists for a second or two.
 */
export function TypingBubble({ avatar, label = "Typing" }: { avatar: React.ReactNode; label?: string }) {
  return (
    <div className="flex justify-start gap-2.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full">{avatar}</div>
      <div
        className="flex items-center rounded-lg rounded-tl-none bg-gray-100 px-4 py-3.5 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <TypingDots />
      </div>
    </div>
  )
}
