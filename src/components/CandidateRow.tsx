'use client'
import type { Candidate } from '@/lib/types'

// Helper for formatting keys
const formatScoreKey = (key: string) => {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase()
}

const getSignalColor = (status: string | null) => {
  if (status === 'available' || status === 'enotfound') return 'bg-emerald-500'
  if (status === 'taken') return 'bg-red-500'
  return 'bg-gray-300'
}

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
    <div className="card-container candidate-card-hover p-8 space-y-6 mb-6">
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

      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-[#787774]">{c.rationale}</p>

        {c.mechanism && (
          <p className="text-xs italic text-[#787774] border-l-2 border-[#FF4F00] pl-3 mt-4">
            <span className="mono text-[9px] font-bold uppercase not-italic block mb-1">
              Mechanism
            </span>
            {c.mechanism}
          </p>
        )}
      </div>

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

      {/* New Scores Matrix Section */}
      {c.scores && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-[#EAEAEA]">
          {Object.entries(c.scores).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-[9px] mono uppercase text-[#787774]">
                <span>{formatScoreKey(key)}</span>
                <span className="font-bold text-[#111111]">{value}/10</span>
              </div>
              <div className="h-1 bg-[#EAEAEA] w-full">
                <div className="h-full bg-[#FF4F00]" style={{ width: `${value * 10}%` }} />
              </div>
            </div>
          ))}
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
            {Object.entries(c.domains.tlds).map(([tld, status]) => {
              const signals = c.domains.tldSignals?.[tld]

              if (signals) {
                return (
                  <div key={tld} className="flex-1 relative group">
                    <div className="flex gap-[1px] h-2">
                      <div className={`flex-1 ${getSignalColor(signals.dns)}`} />
                      <div className={`flex-1 ${getSignalColor(signals.rdap)}`} />
                      <div className={`flex-1 ${getSignalColor(signals.registrar)}`} />
                    </div>
                    {/* Tooltip for domain name */}
                    <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-[#111111] text-white text-[9px] mono px-2 py-1 rounded-sm whitespace-nowrap z-10">
                      .{tld}: {status.charAt(0).toUpperCase() + status.slice(1)}
                    </div>
                  </div>
                )
              }

              return (
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
              )
            })}
          </div>
          {c.domains.tldSignals && (
            <div className="mt-2 flex items-center gap-1 text-[8px] mono text-[#787774] uppercase">
              <div className="w-1 h-2 bg-gray-300" />
              <span>Source Layers: DNS, RDAP, Registrar</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
