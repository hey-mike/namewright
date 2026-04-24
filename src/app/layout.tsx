import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Namewright — Pre-incorporation brand name shortlist for founders',
  description:
    'Submit your startup brief. Get 8–12 ranked brand-name candidates screened against trademark registries, domain availability, and strategic fit — before you register a company or buy a domain.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,300;1,8..60,400;1,8..60,600&family=Lato:wght@300;400;700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          backgroundColor: 'oklch(0.993 0.008 80)',
          color: 'oklch(0.180 0.028 55)',
          fontFamily: "'Lato', system-ui, sans-serif",
          fontWeight: 300,
        }}
      >
        {children}
        {/* Vercel Web Analytics — auto-no-ops in dev and on non-Vercel deploys.
            Activate by enabling Web Analytics in Vercel project settings. */}
        <Analytics />
      </body>
    </html>
  )
}
