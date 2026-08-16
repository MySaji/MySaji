import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { wrapEmailLayout, emailButton, siteOrigin } from '@/lib/email-templates'
import { logAdminAction } from '@/lib/actions/admin-dashboard'

// Renders the admin's free-text content into the shared branded shell —
// each line becomes a paragraph, except a line that's just a bare URL,
// which becomes a real CTA button instead (unsubscribeUrl is per-recipient,
// so the shell itself is built once per recipient in the send loop below,
// not once for the whole batch).
function renderContentHtml(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed) return ''
      if (trimmed.startsWith('http')) return `<p>${emailButton(trimmed, trimmed)}</p>`
      return `<p>${trimmed}</p>`
    })
    .join('')
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    const role = session?.user?.role
    if (!session?.user?.id || (role !== 'admin' && role !== 'sub-admin')) {
      return NextResponse.json({ error: 'You must be signed in as an admin or sub-admin.' }, { status: 403 })
    }

    const { recipients, subject, content } = await request.json()

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json(
        { error: 'No recipients provided' },
        { status: 400 }
      )
    }

    if (!subject || !content) {
      return NextResponse.json(
        { error: 'Subject and content are required' },
        { status: 400 }
      )
    }

    const origin = siteOrigin()
    const bodyHtml = renderContentHtml(content)
    const subscriberTokens = new Map<string, string>()
    for (const s of await db.subscriber.findMany({ where: { email: { in: recipients as string[] } }, select: { email: true, unsubscribeToken: true } })) {
      subscriberTokens.set(s.email, s.unsubscribeToken)
    }

    let sent = 0
    let failed = 0
    let unconfigured = 0
    for (const to of recipients as string[]) {
      const token = subscriberTokens.get(to)
      const html = wrapEmailLayout({
        title: subject,
        bodyHtml,
        unsubscribeUrl: token ? `${origin}/api/subscribers/unsubscribe?token=${token}` : undefined,
      })
      const result = await sendEmail({ to, subject, html })
      if (result.sent) sent++
      else if (result.error) failed++
      else unconfigured++
    }

    if (unconfigured > 0 && sent === 0 && failed === 0) {
      return NextResponse.json(
        { error: 'SMTP is not configured — no emails were sent. Set SMTP_HOST/PORT/USER/PASS to enable real sending.' },
        { status: 503 }
      )
    }

    await logAdminAction({
      userId: session.user.id,
      action: 'subscriber.email',
      entityType: 'Subscriber',
      entityId: 'newsletter',
      newValues: { subject, recipientCount: recipients.length, sent, failed, unconfigured },
    })

    return NextResponse.json(
      {
        success: true,
        message: `Email sent to ${sent} of ${recipients.length} recipient(s)${failed > 0 ? `, ${failed} failed` : ''}`,
        sent,
        failed,
        unconfigured,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Newsletter sending error:', error)
    return NextResponse.json(
      { error: 'Failed to send newsletter' },
      { status: 500 }
    )
  }
}
