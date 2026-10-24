/** The public offering hierarchy. Learn is the existing knowledge hub, not a second copy. */
export const OFFERING_LINKS = [
  { label: "Shop products", shortLabel: "Shop", href: "/shop" },
  { label: "Find services & work", shortLabel: "Work", href: "/work" },
  { label: "Rent equipment", shortLabel: "Rent", href: "/rent" },
  { label: "Learn: help & guides", shortLabel: "Learn", href: "/knowledge" },
  { label: "Business tools & growth", shortLabel: "Grow", href: "/grow" },
  { label: "Saji Pro for professionals", shortLabel: "Saji Pro", href: "/pro" },
  { label: "Saji Till point of sale", shortLabel: "Saji Till", href: "/pos" },
] as const
export const OFFERING_SLUGS = ["shop", "work", "rent", "grow", "pro"] as const
