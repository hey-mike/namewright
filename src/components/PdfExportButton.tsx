'use client'

export function PdfExportButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 text-sm font-medium rounded inline-flex items-center gap-2"
      style={{
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-1)',
        transition: 'background 0.12s',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <path
          d="M7 2v7M4.5 7 7 9.5 9.5 7M2 11h10"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Print / Save as PDF
    </button>
  )
}
