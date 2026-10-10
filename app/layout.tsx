import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { SessionProvider } from "next-auth/react"
import { auth } from "@/backend/auth"
import { ThemeProvider } from "@/frontend/components/theme-provider"
import { LocalizationProvider } from "@/frontend/lib/localization-context"
import type { Language } from "@/backend/domain/i18n"
import { AuthProvider } from "@/frontend/lib/auth-context"
import { VerificationPromptProvider } from "@/frontend/lib/verification-prompt-context"
import { EmailSubscriptionPopup } from "@/frontend/components/email-subscription-popup"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "SAJI - Marketplace",
  description:
    "Connect with trusted service providers. SAJI connects you with verified professionals for all your service needs.",
  applicationName: "SAJI",
  creator: "SAJI Team",
  keywords: ["marketplace", "services", "providers", "booking"],
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon-192.png",
      },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
    generator: 'Next.js',
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#ffffff",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Fetching the session server-side and handing it to SessionProvider lets
  // it skip its own client-side fetch on initial mount entirely (see
  // node_modules/next-auth/react.js: it only calls getSession() itself when
  // it doesn't already have a session). That client fetch is exactly the
  // call site that was intermittently failing against this environment's
  // flaky DB pooler ("ClientFetchError: Unexpected end of JSON input") and,
  // on failure, setting the session to null — logging an already
  // successfully-authenticated user out on the client for no real reason.
  // Resolving the session through the same reliable server-render pipeline
  // that renders the rest of the page removes that failure mode for the
  // initial load (periodic client-side revalidation later in the session's
  // lifetime still goes through the same fragile path — a known remaining
  // gap, not something fixable without patching next-auth itself).
  const session = await auth()

  return (
    <html lang={session?.user?.language ?? "en"} suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SAJI" />
      </head>
      <body className={`font-sans antialiased ${_geist.className}`}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} themes={["light", "dark"]} disableTransitionOnChange>
          <SessionProvider session={session}>
            {/* Seeded from the session so the server renders the signed-in
                user's real locale and the client hydrates to a match. */}
            <LocalizationProvider
              initialLanguage={(session?.user?.language as Language) ?? "en"}
              initialCurrency={session?.user?.currency ?? "KES"}
            >
              <AuthProvider>
                {/* Progressive KYC: mounts the one verification wizard for the
                    whole app, so any gated action can open it in place rather
                    than navigating the user out of what they were doing.
                    Inside AuthProvider because the wizard reads and refreshes
                    the session through useAuthContext. */}
                <VerificationPromptProvider>
                  {children}
                  <EmailSubscriptionPopup />
                </VerificationPromptProvider>
              </AuthProvider>
            </LocalizationProvider>
          </SessionProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
