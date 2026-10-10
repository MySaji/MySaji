import { NextRequest, NextResponse } from "next/server"
import { db } from "@/backend/db"

// Simple one-click GET unsubscribe (opened directly from an email link, no
// JS/cookies available) — the token is an unguessable per-subscriber value,
// so knowing it is treated as sufficient authorization, the same trust model
// every other "magic link" unsubscribe/verification flow uses.
function htmlPage(message: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>SAJI: Unsubscribe</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background:#f3f4f6; margin:0; padding:0; }
          .card { max-width:420px; margin:80px auto; background:white; border-radius:12px; padding:40px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
          .logo { font-size:22px; font-weight:bold; color:#667eea; margin-bottom:16px; }
          p { color:#4b5563; }
          a { color:#667eea; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">SAJI</div>
          <p>${message}</p>
          <p><a href="/">Return to SAJI</a></p>
        </div>
      </body>
    </html>
  `
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")
  if (!token) {
    return new NextResponse(htmlPage("This unsubscribe link is missing its token."), { status: 400, headers: { "Content-Type": "text/html" } })
  }

  const subscriber = await db.subscriber.findUnique({ where: { unsubscribeToken: token } })
  if (!subscriber) {
    // Already unsubscribed (or an old/invalid link) — a repeat click should
    // still read as success, not an error, since the end state the user
    // wants (not receiving these emails) is already true.
    return new NextResponse(htmlPage("You're not subscribed to SAJI updates."), { status: 200, headers: { "Content-Type": "text/html" } })
  }

  await db.subscriber.delete({ where: { id: subscriber.id } })

  return new NextResponse(htmlPage("You've been unsubscribed from SAJI updates. Sorry to see you go!"), { status: 200, headers: { "Content-Type": "text/html" } })
}
