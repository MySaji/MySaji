"use client"

import { Button } from "@/components/ui/button"

export function OAuthButtons() {
  const handleGoogleSignIn = () => {
    // Simulate Google OAuth - in production, integrate with actual OAuth provider
    console.log("Google sign in clicked")
    // Redirect to Google OAuth
    window.location.href = "https://accounts.google.com/o/oauth2/v2/auth"
  }

  const handleAppleSignIn = () => {
    // Simulate Apple OAuth - in production, integrate with actual OAuth provider
    console.log("Apple sign in clicked")
    // Redirect to Apple OAuth
    window.location.href = "https://appleid.apple.com/auth"
  }

  return (
    <div className="space-y-3 w-full">
      <Button
        onClick={handleGoogleSignIn}
        className="w-full bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-300 font-semibold flex items-center justify-center gap-2 h-11"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Continue with Google
      </Button>

      <Button
        onClick={handleAppleSignIn}
        className="w-full bg-black hover:bg-gray-900 text-white border-2 border-black font-semibold flex items-center justify-center gap-2 h-11"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 13.5c-.91 0-1.64.26-2.21.77-.58.5-.93 1.24-1.07 2.22h6.56c-.08-1.13-.48-2.02-1.2-2.63-.71-.61-1.66-.91-2.88-.91m0-1.2c1.63 0 3.02.51 4.17 1.52s1.76 2.44 1.95 4.3H12.6c.09-1.02.48-1.88 1.07-2.59s1.41-1.23 2.28-1.23zm-3.16 6.5c0 .47-.16.86-.49 1.18-.33.32-.72.48-1.18.48-.46 0-.86-.16-1.18-.48-.32-.32-.49-.71-.49-1.18 0-.47.16-.86.49-1.18.32-.32.72-.48 1.18-.48.46 0 .85.16 1.18.48.33.32.49.71.49 1.18M8 13.5c-.91 0-1.64.26-2.21.77C5.21 14.77 4.86 15.51 4.72 16.5h6.56c-.08-1.13-.48-2.02-1.2-2.63-.71-.61-1.66-.91-2.88-.91m0-1.2c1.63 0 3.02.51 4.17 1.52s1.76 2.44 1.95 4.3H2.6c.09-1.02.48-1.88 1.07-2.59S5.08 13.3 5.95 13.3z" />
        </svg>
        Continue with Apple
      </Button>
    </div>
  )
}
