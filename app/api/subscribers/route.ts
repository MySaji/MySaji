import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { wrapEmailLayout, emailButton, siteOrigin } from '@/lib/email-templates'

function buildWelcomeEmailHtml(unsubscribeToken: string): string {
  const origin = siteOrigin()
  const body = `
    <h2>Welcome to SAJI!</h2>
    <p>You're subscribed. Here's what to expect in your inbox:</p>
    <p>
      📦 <strong>New products</strong> as soon as shops list them<br/>
      🔄 <strong>Restocked items</strong> you might have missed<br/>
      🔥 <strong>Trending picks</strong> other customers are loving<br/>
    </p>
    <p>We send this roughly once a week. No spam, just what's new.</p>
    <p style="margin-top:24px;">${emailButton("Browse SAJI now", `${origin}/customer/products`)}</p>
  `
  return wrapEmailLayout({
    title: "You're subscribed!",
    bodyHtml: body,
    unsubscribeUrl: `${origin}/api/subscribers/unsubscribe?token=${unsubscribeToken}`,
  })
}

export async function POST(request: NextRequest) {
  try {
    const { email, deviceId } = await request.json()

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const existing = await db.subscriber.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json({ success: true, alreadySubscribed: true, message: 'Already subscribed' }, { status: 200 })
    }

    const subscriber = await db.subscriber.create({
      data: { email: normalizedEmail, deviceId: typeof deviceId === 'string' ? deviceId : null },
    })

    // Best-effort: the subscription itself already succeeded (the DB row
    // exists), so an SMTP hiccup or unconfigured mailer shouldn't turn a
    // real subscribe into a user-facing error.
    await sendEmail({
      to: normalizedEmail,
      subject: "You're subscribed to SAJI updates",
      html: buildWelcomeEmailHtml(subscriber.unsubscribeToken),
    }).catch(() => {})

    return NextResponse.json({ success: true, alreadySubscribed: false, message: 'Subscription added successfully' }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Failed to process subscription' }, { status: 500 })
  }
}
