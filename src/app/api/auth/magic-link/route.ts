import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { setMagicLink } from '@/lib/kv'
import { prisma } from '@/lib/db'
import { sendMagicLinkEmail } from '@/lib/email'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Verify the user exists before sending a magic link
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    if (user) {
      const token = randomUUID()
      await setMagicLink(token, normalizedEmail)

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const magicLinkUrl = `${appUrl}/api/auth/verify?token=${token}`

      await sendMagicLinkEmail(normalizedEmail, magicLinkUrl)
    }

    // Always return success even if user doesn't exist, to prevent email enumeration
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
