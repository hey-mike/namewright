'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LoginModal } from './LoginModal'
import { useRouter } from 'next/navigation'

export function HeaderClient({ isLoggedIn }: { isLoggedIn: boolean }) {
  const [isLoginOpen, setIsLoginOpen] = useState(false)
  const router = useRouter()

  const handleSignOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.refresh()
  }

  return (
    <>
      <header className="border-b border-[rgba(0,0,0,0.06)] bg-white">
        <div className="max-w-6xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF4F00]" />
            <span className="mono text-xs font-bold tracking-widest uppercase text-zinc-900">
              Namewright
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <div className="mono text-[10px] text-[#787774] uppercase tracking-widest hidden sm:block">
              Pre-Incorporation
            </div>
            {isLoggedIn ? (
              <div className="flex items-center gap-4">
                <Link
                  href="/my-reports"
                  className="mono text-[10px] text-zinc-900 uppercase tracking-widest hover:text-[#FF4F00] transition-colors"
                >
                  My Reports
                </Link>
                <button
                  onClick={handleSignOut}
                  className="mono text-[10px] text-zinc-900 uppercase tracking-widest hover:text-[#FF4F00] transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginOpen(true)}
                className="mono text-[10px] text-zinc-900 uppercase tracking-widest hover:text-[#FF4F00] transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} />
    </>
  )
}
