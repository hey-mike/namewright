'use client'

import { useState } from 'react'

export function LoginModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) throw new Error()
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[#fdfaf3] p-8 shadow-xl">
        <div className="mb-6 flex items-start justify-between">
          <h2 className="font-serif text-2xl font-bold text-[#1a1108]">Sign in</h2>
          <button
            onClick={onClose}
            className="text-[#9c8a76] hover:text-[#5c4a36]"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {status === 'success' ? (
          <div className="rounded-lg bg-[#3d6b3d]/10 p-4 text-center text-[#3d6b3d]">
            <p>Check your email for a magic link!</p>
            <p className="mt-2 text-sm opacity-80">You can close this window.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#5c4a36]">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 block w-full rounded-md border border-[#e5dccd] bg-white px-3 py-2 text-[#1a1108] shadow-sm focus:border-[#b87333] focus:outline-none focus:ring-1 focus:ring-[#b87333]"
              />
            </div>

            {status === 'error' && (
              <p className="text-sm text-[#a83232]">Something went wrong. Please try again.</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="flex w-full justify-center rounded-full bg-[#1a1108] px-4 py-2 text-sm font-medium text-[#fcf8f0] hover:bg-[#312213] focus:outline-none focus:ring-2 focus:ring-[#b87333] focus:ring-offset-2 disabled:opacity-50"
            >
              {status === 'loading' ? 'Sending...' : 'Send Magic Link'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
