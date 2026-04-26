import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import logger from './logger'
import type { ReportData } from './types'
import { validateReportData } from './anthropic'

// Lazy singleton initialization to ensure env vars are checked at runtime
let _s3: S3Client | null = null
function s3(): S3Client {
  if (!_s3) {
    if (!process.env.R2_ENDPOINT_URL && !process.env.R2_ACCOUNT_ID) {
      throw new Error('Either R2_ENDPOINT_URL or R2_ACCOUNT_ID must be provided')
    }
    if (!process.env.R2_ACCESS_KEY_ID) throw new Error('R2_ACCESS_KEY_ID is missing')
    if (!process.env.R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY is missing')
    if (!process.env.R2_BUCKET_NAME) throw new Error('R2_BUCKET_NAME is missing')

    _s3 = new S3Client({
      region: 'auto',
      endpoint:
        process.env.R2_ENDPOINT_URL ||
        `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: !!process.env.R2_ENDPOINT_URL, // Required for Minio
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
  }
  return _s3
}

export async function saveReport(reportId: string, report: ReportData): Promise<void> {
  const key = `reports/${reportId}.json`
  const bucket = process.env.R2_BUCKET_NAME

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(report),
      ContentType: 'application/json',
    })
  )

  logger.info({ key, reportId, event: 'r2_save' }, 'report saved to R2')
}

export async function saveReportPdf(reportId: string, pdf: Buffer): Promise<void> {
  const key = `reports/${reportId}.pdf`
  const bucket = process.env.R2_BUCKET_NAME

  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: pdf,
      ContentType: 'application/pdf',
    })
  )

  logger.info({ key, reportId, bytes: pdf.length, event: 'r2_save_pdf' }, 'pdf saved to R2')
}

export async function getReportPdf(reportId: string): Promise<Buffer | null> {
  const key = `reports/${reportId}.pdf`
  const bucket = process.env.R2_BUCKET_NAME

  try {
    const response = await s3().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )

    if (!response.Body) return null

    const bytes = await response.Body.transformToByteArray()
    return Buffer.from(bytes)
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'NoSuchKey') {
      return null
    }
    logger.warn(
      { reportId, err: err instanceof Error ? err.message : String(err) },
      'R2 pdf retrieval failed'
    )
    return null
  }
}

export async function getReport(reportId: string): Promise<ReportData | null> {
  const key = `reports/${reportId}.json`
  const bucket = process.env.R2_BUCKET_NAME

  try {
    const response = await s3().send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )

    if (!response.Body) return null

    const rawString = await response.Body.transformToString()
    const raw = JSON.parse(rawString)

    return validateReportData(raw)
  } catch (err: unknown) {
    // NoSuchKey means the report doesn't exist
    if (err instanceof Error && err.name === 'NoSuchKey') {
      return null
    }

    logger.warn(
      { reportId, err: err instanceof Error ? err.message : String(err) },
      'R2 report retrieval or validation failed'
    )
    return null
  }
}
