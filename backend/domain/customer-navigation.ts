export const CUSTOMER_SECTIONS = [
  { key: "home", label: "Home", group: "Discover", related: ["services", "community", "orders"] },
  {
    key: "services",
    label: "Explore services",
    group: "Discover",
    related: ["find-specialists", "requests", "favorites"],
  },
  { key: "products", label: "Products", group: "Discover", related: ["shops", "cart", "orders"] },
  { key: "shops", label: "Shops", group: "Discover", related: ["products", "favorites", "orders"] },
  {
    key: "find-specialists",
    label: "Find specialists",
    group: "Discover",
    related: ["services", "find-now", "requests"],
  },
  {
    key: "find-now",
    label: "Find help now",
    group: "Discover",
    related: ["find-specialists", "requests", "jobs"],
  },
  { key: "search", label: "Search", group: "Discover", related: ["services", "products", "shops"] },
  {
    key: "jobs",
    label: "My jobs",
    group: "Activity",
    related: ["messages", "requests", "recurring-maintenance"],
  },
  { key: "orders", label: "My orders", group: "Activity", related: ["cart", "shops", "help"] },
  {
    key: "bookings",
    label: "Salon appointments",
    group: "Activity",
    related: ["services", "messages", "saved-addresses"],
  },
  {
    key: "booking",
    label: "Book a service",
    group: "Activity",
    related: ["services", "saved-addresses", "jobs"],
  },
  {
    key: "booking-confirmation",
    label: "Booking confirmation",
    group: "Activity",
    related: ["jobs", "messages", "home"],
  },
  { key: "cart", label: "Your cart", group: "Shopping", related: ["products", "saved-addresses", "orders"] },
  { key: "rentals", label: "Rental details", group: "Activity", related: ["jobs", "messages", "help"] },
  {
    key: "requests",
    label: "Request board",
    group: "Activity",
    related: ["service-requests", "find-specialists", "jobs"],
  },
  {
    key: "service-requests",
    label: "My quotes",
    group: "Activity",
    related: ["requests", "find-specialists", "jobs"],
  },
  { key: "offers", label: "Offer details", group: "Discover", related: ["services", "favorites", "cart"] },
  { key: "community", label: "Community", group: "Connect", related: ["messages", "requests", "help"] },
  { key: "messages", label: "Messages", group: "Connect", related: ["jobs", "community", "notifications"] },
  {
    key: "notifications",
    label: "Notifications",
    group: "Connect",
    related: ["messages", "jobs", "settings"],
  },
  {
    key: "household",
    label: "Your household",
    group: "Account",
    related: ["saved-addresses", "recurring-maintenance", "jobs"],
  },
  {
    key: "recurring-maintenance",
    label: "Recurring maintenance",
    group: "Activity",
    related: ["household", "jobs", "services"],
  },
  {
    key: "profile",
    label: "Your profile",
    group: "Account",
    related: ["settings", "saved-addresses", "household"],
  },
  {
    key: "saved-addresses",
    label: "Saved addresses",
    group: "Account",
    related: ["profile", "household", "cart"],
  },
  {
    key: "favorites",
    label: "Saved favourites",
    group: "Discover",
    related: ["services", "shops", "community"],
  },
  { key: "rewards", label: "Rewards", group: "Account", related: ["referrals", "wallet", "shops"] },
  { key: "referrals", label: "Invite friends", group: "Account", related: ["rewards", "community", "home"] },
  { key: "wallet", label: "Your wallet", group: "Account", related: ["orders", "jobs", "help"] },
  {
    key: "settings",
    label: "Settings",
    group: "Account",
    related: ["profile", "notifications", "privacy-policy"],
  },
  { key: "help", label: "Help & support", group: "Support", related: ["messages", "orders", "jobs"] },
  {
    key: "privacy-policy",
    label: "Privacy policy",
    group: "Support",
    related: ["settings", "help", "profile"],
  },
] as const
export function customerSection(pathname: string) {
  if (!pathname.startsWith("/customer/")) return null
  const key = pathname.split("/")[2]
  return CUSTOMER_SECTIONS.find((section) => section.key === key) ?? null
}
