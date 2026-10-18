import type { Metadata, Viewport } from "next"
import { TillInstallProvider } from "@/frontend/components/pos/install-provider"

/**
 * Exists only to give the till its own web app manifest.
 *
 * The root layout points at /manifest.json, which installs the whole
 * marketplace as "SAJI" opening at "/". That is the right app for a
 * customer and the wrong one for a counter: a cashier wants an icon that
 * opens the register, named Till, with nothing else around it.
 *
 * Next merges metadata down the tree and `manifest` is a single value, so
 * this one wins for /pos/sell and its children, and every other route
 * keeps the marketplace manifest. The till page itself is a client
 * component and cannot export metadata, which is the other reason this
 * layout is here.
 */
export const metadata: Metadata = {
  title: "Saji Till — POS",
  applicationName: "Saji Till",
  appleWebApp: { capable: true, title: "Saji Till", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/pos/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/pos/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/pos/favicon.ico",
    apple: "/pos/icon-192.png",
  },
  manifest: "/till-manifest.json",
}

/**
 * The installed window's chrome. Dark slate matches the till's accent and
 * the manifest's theme_color; they must agree or the title bar flickers to a
 * different colour on launch.
 *
 * In the `viewport` export rather than `metadata`: Next moved themeColor
 * there, and leaving it in metadata only produces a build warning and no
 * theme colour at all.
 */
export const viewport: Viewport = {
  themeColor: "#0f172a",
}

export default function TillLayout({ children }: { children: React.ReactNode }) {
  return <TillInstallProvider>{children}</TillInstallProvider>
}
