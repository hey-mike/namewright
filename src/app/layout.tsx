import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Namewright — Name it well. Own it defensibly.',
  description: 'AI-generated brand name candidates with trademark risk assessment and domain availability.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ backgroundColor: 'oklch(0.983 0.004 228)', color: 'oklch(0.260 0.012 265)', fontFamily: "'Geist', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
