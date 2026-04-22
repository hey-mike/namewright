import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Namewright — Name it well. Own it defensibly.',
  description:
    'AI-generated brand name candidates with trademark risk assessment and domain availability.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Geist:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          backgroundColor: 'oklch(0.983 0.004 228)',
          color: 'oklch(0.260 0.012 265)',
          fontFamily: "'Geist', system-ui, sans-serif",
        }}
      >
        {children}
      </body>
    </html>
  )
}
