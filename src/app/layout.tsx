import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Namewright — Name it well. Own it defensibly.',
  description:
    'AI-generated brand name candidates with trademark risk assessment and domain availability.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Plausible — privacy-friendly analytics, no cookie banner needed.
  // Tag is rendered only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set, so dev
  // and pre-launch deploys are clean.
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,300;1,8..60,400;1,8..60,600&family=Lato:wght@300;400;700&family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {plausibleDomain && (
          <Script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
            strategy="afterInteractive"
          />
        )}
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
      </body>
    </html>
  )
}
