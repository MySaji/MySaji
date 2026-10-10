"use client"

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl"
  showText?: boolean
  className?: string
}

export function Logo({ size = "md", showText = true, className = "" }: LogoProps) {
  const sizes = {
    sm: { icon: 24, text: "text-lg" },
    md: { icon: 32, text: "text-xl" },
    lg: { icon: 40, text: "text-2xl" },
    xl: { icon: 56, text: "text-3xl" }
  }

  const { icon, text } = sizes[size]

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LogoMark size={icon} />

      {showText && (
        <span className={`font-bold ${text} bg-gradient-to-r from-blue-500 via-blue-800 to-orange-500 bg-clip-text text-transparent`}>
          SAJI
        </span>
      )}
    </div>
  )
}

/** The real SAJI logo image (public/icon.jpeg, resized via public/icon-192.png)
 * — not a hand-drawn recreation. The source already bakes in its own white
 * rounded-square card, so no extra background wrapper is needed here. */
export function LogoMark({ size = 32, className = "" }: { size?: number, className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icon-192.png"
      alt="SAJI"
      width={size}
      height={size}
      className={`flex-shrink-0 rounded-lg object-contain ${className}`}
    />
  )
}
