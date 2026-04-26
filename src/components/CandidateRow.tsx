'use client'
import type { Candidate } from '@/lib/types'

export function CandidateRow({
  c,
  index,
  previewLocked = false,
}: {
  c: Candidate
  index: number
  previewLocked?: boolean
}) {
  const isTopPick = index === 0

  return (
    <div className="card-container p-8 space-y-6 mb-6">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="serif text-4xl font-medium text-[#111111]">{c.name}</h3>
        </div>
        {isTopPick && (
          <div className="bg-[#FF4F00] text-white px-3 py-1 text-[10px] mono font-bold uppercase tracking-tighter">
            Top Pick
          </div>
        )}
      </div>

      <p className="text-sm leading-relaxed text-[#787774]">{c.rationale}</p>

      {!previewLocked && (
        <div className="space-y-4 pt-4">
          {c.trademarkNotes && (
            <div>
              <span className="mono text-[10px] tracking-widest uppercase text-[#111111] mb-1 block">
                Trademark Notes
              </span>
              <p className="text-sm leading-relaxed text-[#787774]">{c.trademarkNotes}</p>
            </div>
          )}

          {c.domains.alternates.length > 0 && (
            <div>
              <span className="mono text-[10px] tracking-widest uppercase text-[#111111] mb-1 block">
                Alternates
              </span>
              <div className="flex gap-2 flex-wrap">
                {c.domains.alternates.map((alt) => (
                  <span key={alt} className="text-xs bg-[#EAEAEA] px-2 py-1 text-[#787774]">
                    {alt}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Matrix Visualization */}
      <div className="space-y-4 pt-6 border-t border-[#EAEAEA]">
        {/* Trademark Risk */}
        <div>
          <div className="flex justify-between items-center text-[10px] mono uppercase tracking-widest mb-2">
            <span className="text-[#787774]">Trademark Risk</span>
            <span className="font-bold text-[#111111] uppercase">{c.trademarkRisk}</span>
          </div>
          <div className="w-full h-1.5 bg-[#EAEAEA] rounded-full overflow-hidden">
            <div
              className={`h-full ${
                c.trademarkRisk === 'high'
                  ? 'bg-red-500 w-[85%]'
                  : c.trademarkRisk === 'moderate'
                    ? 'bg-amber-500 w-[50%]'
                    : c.trademarkRisk === 'low'
                      ? 'bg-[#FF4F00] w-[15%]'
                      : 'bg-gray-400 w-[15%]'
              }`}
            />
          </div>
        </div>

        {/* Domain Status */}
        <div>
          <div className="flex justify-between items-center text-[10px] mono uppercase tracking-widest mb-2">
            <span className="text-[#787774]">Domains Checked</span>
          </div>
          <div className="flex gap-1.5">
            {Object.entries(c.domains.tlds).map(([tld, status]) => (
              <div
                key={tld}
                className="h-1.5 bg-[#EAEAEA] rounded-full w-full overflow-hidden relative group"
              >
                <div
                  className={`h-full w-full ${
                    status === 'available'
                      ? 'bg-emerald-500'
                      : status === 'uncertain'
                        ? 'bg-gray-400'
                        : 'bg-red-500'
                  }`}
                />
                {/* Tooltip for domain name */}
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#111111] text-white text-[9px] mono px-2 py-1 rounded-sm whitespace-nowrap z-10">
                  .{tld}: {status.charAt(0).toUpperCase() + status.slice(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
