import { kv } from '@vercel/kv'
import type { ReportData } from './types'

const TTL_SECONDS = 3600

export async function saveReport(reportId: string, report: ReportData): Promise<void> {
  await kv.set(`report:${reportId}`, report, { ex: TTL_SECONDS })
}

export async function getReport(reportId: string): Promise<ReportData | null> {
  return kv.get<ReportData>(`report:${reportId}`)
}
