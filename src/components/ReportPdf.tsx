'use client'
import { Document, Page, View, Text, StyleSheet, PDFDownloadLink } from '@react-pdf/renderer'
import type { ReportData } from '@/lib/types'

const RISK_COLORS: Record<string, string> = {
  low: '#16a34a',
  moderate: '#d97706',
  high: '#dc2626',
  uncertain: '#9ca3af',
}

const DOMAIN_COLORS: Record<string, string> = {
  available: '#16a34a',
  taken: '#dc2626',
  'likely taken': '#dc2626',
  uncertain: '#9ca3af',
}

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingLeft: 52,
    paddingRight: 52,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
    fontSize: 9,
    color: '#374151',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
  },
  brand: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827', letterSpacing: 1.5 },
  date: { fontSize: 8, color: '#9ca3af' },
  section: { marginBottom: 24 },
  sectionLabel: { fontSize: 7, color: '#9ca3af', letterSpacing: 1.5, marginBottom: 8 },
  divider: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
    marginBottom: 12,
  },
  summary: { fontSize: 13, color: '#111827', lineHeight: 1.55, fontFamily: 'Helvetica-Bold' },
  pickRow: { flexDirection: 'row', marginBottom: 14 },
  pickNum: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    width: 20,
    paddingTop: 1,
  },
  pickName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 4 },
  pickBody: { fontSize: 8.5, color: '#6b7280', lineHeight: 1.55 },
  pickStepLabel: {
    fontSize: 7,
    color: '#9ca3af',
    letterSpacing: 1.2,
    marginTop: 7,
    marginBottom: 2,
  },
  candidateRow: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f3f4f6',
    borderBottomStyle: 'solid',
  },
  candidateHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  candidateName: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827' },
  candidateStyle: { fontSize: 7, color: '#9ca3af', letterSpacing: 1 },
  candidateRationale: { fontSize: 8.5, color: '#6b7280', lineHeight: 1.55, marginBottom: 5 },
  trademarkRow: { flexDirection: 'row', marginBottom: 6 },
  trademarkLabel: { fontSize: 7, color: '#9ca3af', letterSpacing: 1, width: 22, paddingTop: 1 },
  trademarkText: { fontSize: 8, color: '#6b7280', lineHeight: 1.5, flex: 1 },
  domainsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  domainItem: { flexDirection: 'row', marginRight: 14, marginBottom: 2 },
  domainTld: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#374151', marginRight: 3 },
  domainStatus: { fontSize: 8 },
  recommendation: {
    fontSize: 10,
    color: '#111827',
    lineHeight: 1.6,
    fontFamily: 'Helvetica-Oblique',
  },
  disclaimer: {
    fontSize: 7.5,
    color: '#9ca3af',
    lineHeight: 1.55,
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: '#e5e7eb',
    borderTopStyle: 'solid',
  },
})

function ReportPdfDocument({ report, today }: { report: ReportData; today: string }) {
  return (
    <Document title="Namewright Brand Research Report">
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.brand}>NAMEWRIGHT</Text>
          <Text style={s.date}>{today}</Text>
        </View>

        <View style={s.section}>
          <Text style={s.sectionLabel}>BRIEF</Text>
          <View style={s.divider} />
          <Text style={s.summary}>{report.summary}</Text>
        </View>

        {report.topPicks.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>TOP PICKS</Text>
            <View style={s.divider} />
            {report.topPicks.map((pick, i) => (
              <View key={pick.name} style={s.pickRow} wrap={false}>
                <Text style={s.pickNum}>{String(i + 1).padStart(2, '0')}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.pickName}>{pick.name}</Text>
                  <Text style={s.pickBody}>{pick.reasoning}</Text>
                  <Text style={s.pickStepLabel}>NEXT STEPS</Text>
                  <Text style={s.pickBody}>{pick.nextSteps}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={s.section}>
          <Text style={s.sectionLabel}>ALL CANDIDATES — RANKED</Text>
          <View style={s.divider} />
          {report.candidates.map((c, i) => (
            <View key={c.name} style={s.candidateRow} wrap={false}>
              <View style={s.candidateHeader}>
                <Text style={s.candidateName}>
                  {String(i + 1).padStart(2, '0')}. {c.name}
                </Text>
                <Text
                  style={[s.candidateStyle, { color: RISK_COLORS[c.trademarkRisk] ?? '#9ca3af' }]}
                >
                  {c.trademarkRisk.toUpperCase()} RISK
                </Text>
              </View>
              <Text style={s.candidateRationale}>{c.rationale}</Text>
              <View style={s.trademarkRow}>
                <Text style={s.trademarkLabel}>TM</Text>
                <Text style={s.trademarkText}>{c.trademarkNotes}</Text>
              </View>
              <View style={s.domainsRow}>
                {Object.entries(c.domains.tlds).map(([tld, status]) => (
                  <View key={tld} style={s.domainItem}>
                    <Text style={s.domainTld}>.{tld}</Text>
                    <Text style={[s.domainStatus, { color: DOMAIN_COLORS[status] ?? '#9ca3af' }]}>
                      {status}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {report.recommendation && (
          <View style={s.section} wrap={false}>
            <Text style={s.sectionLabel}>RECOMMENDATION</Text>
            <View style={s.divider} />
            <Text style={s.recommendation}>{report.recommendation}</Text>
          </View>
        )}

        <View wrap={false}>
          <Text style={s.disclaimer}>
            Not legal advice. AI-assisted research as of {today}. Domain and trademark data is
            preliminary — verify with a domain registrar and a qualified IP attorney before filing.
          </Text>
        </View>
      </Page>
    </Document>
  )
}

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
