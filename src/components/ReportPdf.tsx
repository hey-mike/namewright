'use client'
import { PDFDownloadLink } from '@react-pdf/renderer'
import type { ReportData } from '@/lib/types'
import { ReportPdfDocument } from './ReportPdfDocument'

export default function PdfDownload({ report }: { report: ReportData }) {
  const today = new Date().toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const filename = `namewright-${new Date().toISOString().split('T')[0]}.pdf`

  return (
    <PDFDownloadLink
      document={<ReportPdfDocument report={report} today={today} />}
      fileName={filename}
      style={{ textDecoration: 'none' }}
    >
      {({ loading }) => (
        <button
          className="px-4 py-2 text-sm font-medium rounded inline-flex items-center gap-2"
          style={{
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-1)',
            transition: 'background 0.12s',
            cursor: loading ? 'wait' : 'pointer',
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
          {loading ? 'Preparing PDF…' : 'Download PDF'}
        </button>
      )}
    </PDFDownloadLink>
  )
}
