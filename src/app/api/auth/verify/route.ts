import { type NextRequest, NextResponse } from 'next/server'
import { consumeMagicLink } from '@/lib/kv'
import { prisma } from '@/lib/db'
import { signUserSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(new URL('/my-reports?error=invalid_token', request.url))
  }

  const email = await consumeMagicLink(token)

  if (!email) {
    return NextResponse.redirect(new URL('/my-reports?error=expired', request.url))
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return NextResponse.redirect(new URL('/my-reports?error=user_not_found', request.url))
  }

  const sessionToken = await signUserSession(user.id)
  const response = NextResponse.redirect(new URL('/my-reports', request.url))

  response.cookies.set({
    name: 'session',
    value: sessionToken,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  })

  return response
}
