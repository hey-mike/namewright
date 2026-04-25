import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Newsreader, Geist, Geist_Mono } from 'next/font/google'

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  style: ['normal', 'italic'],
})
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'Namewright — Pre-incorporation brand name shortlist for founders',
  description:
    'Submit your startup brief. Get 8–12 ranked brand-name candidates screened against trademark registries, domain availability, and strategic fit — before you register a company or buy a domain.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${geist.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased text-zinc-900 bg-[#FBFBFA]">
        {children}
        {/* Vercel Web Analytics — auto-no-ops in dev and on non-Vercel deploys.
            Activate by enabling Web Analytics in Vercel project settings. */}
        <Analytics />
      </body>
    </html>
  )
}
