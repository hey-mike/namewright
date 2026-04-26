'use client'
import { useEffect, useRef, useState } from 'react'
import type { RejectedCandidate } from '@/lib/types'

export function RejectedNames({ candidates }: { candidates: RejectedCandidate[] }) {
  const [isVisible, setIsVisible] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.1 }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [])

  if (!candidates || candidates.length === 0) return null

  return (
    <section
      ref={sectionRef}
      className={`mb-14 pt-10 border-t border-[#EAEAEA] transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
    >
      <p className="mono text-[10px] tracking-widest uppercase mb-6 text-[#787774]">
        Proof of Work — Filtered Candidates
      </p>
      <div className="space-y-6">
        {candidates.map((c, i) => (
          <div
            key={c.name}
            className="flex gap-4"
            style={{
              transitionDelay: `${i * 50}ms`,
            }}
          >
            <div className="shrink-0 pt-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M2 2L10 10M10 2L2 10"
                  stroke="#787774"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <div>
              <h4 className="mono text-xs font-bold text-[#111111] uppercase mb-1">{c.name}</h4>
              <p className="text-xs text-[#787774] leading-relaxed font-light">{c.reason}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-[10px] text-[#787774] italic leading-relaxed">
        These names were generated during the initial exploration phase but were filtered out by the
        strategy engine due to trademark crowding, phonetic ambiguity, or strategic misalignment.
        They are included here to show the breadth of search.
      </p>
    </section>
  )
}
