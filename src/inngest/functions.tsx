import { renderToBuffer } from '@react-pdf/renderer'
import { inngest } from './client'
import { generateReport, getErrorStage } from '@/lib/anthropic'
import { saveReport, saveReportPdf } from '@/lib/r2'
import { setJobStatus } from '@/lib/kv'
import { notifySlack } from '@/lib/alerts'
import { ReportPdfDocument } from '@/components/ReportPdfDocument'
import Anthropic from '@anthropic-ai/sdk'
import logger from '@/lib/logger'
import type { GenerateRequest } from '@/lib/types'

export const generateReportJob = inngest.createFunction(
  {
    id: 'generate-report',
    retries: 0,
    triggers: [{ event: 'report.generate' }],
  },
  async ({ event, step, runId, attempt }) => {
    const { body, requestId, jobId, mockPipeline, reportId } = event.data as {
      body: GenerateRequest
      requestId: string
      jobId: string
      reportId: string
      mockPipeline?: boolean
    }

    const startedAt = Date.now()
    // runId + attempt let us bridge from the Inngest dev UI to our app logs and
    // see retries explicitly. eventId pins the originating /api/generate call.
    const log = logger.child({
      requestId,
      jobId,
      runId,
      attempt,
      eventId: event.id,
      route: 'inngest-generate',
    })

    // Step 1: Ensure initial status is set
    await step.run('set-initial-status', async () => {
      log.info({ event: 'step_started', step: 'set-initial-status' }, 'step started')
      await setJobStatus(jobId, { status: 'pending' })
    })

    // Step 2: Generate Report via LLM and verification APIs
    let report
    try {
      report = await step.run('generate-report', async () => {
        log.info({ event: 'step_started', step: 'generate-report' }, 'step started')
        return await generateReport(
          {
            description: body.description,
            personality: body.personality,
            geography: body.geography,
            constraints: body.constraints,
            tlds: body.tlds,
            nameType: body.nameType,
          },
          { requestId, mockPipeline }
        )
      })
    } catch (err: unknown) {
      let userError = 'Report generation failed. Please try again.'
      const stage = getErrorStage(err)
      const durationMs = Date.now() - startedAt

      if (err instanceof Anthropic.RateLimitError) {
        log.warn({ err: err.message, stage, durationMs }, 'rate limited by Anthropic')
        userError = 'We are experiencing high demand. Please try again in a moment.'
      } else if (
        err instanceof Anthropic.APIError &&
        err.status === 400 &&
        err.message.includes('credit balance')
      ) {
        log.error({ err: err.message, stage, durationMs }, 'Anthropic credit balance exhausted')
        await notifySlack({
          severity: 'critical',
          title: 'Anthropic credit balance exhausted',
          details: { error: err.message, stage },
          requestId,
        })
        userError = 'Service temporarily unavailable. Please try again later.'
      } else {
        log.error(
          { err: err instanceof Error ? err.message : String(err), stage, durationMs },
          'report generation failed'
        )
      }

      await step.run('set-failed-status', async () => {
        await setJobStatus(jobId, { status: 'failed', error: userError })
      })

      throw err
    }

    // Step 3: Save to permanent storage
    try {
      await step.run('save-report', async () => {
        log.info({ event: 'step_started', step: 'save-report' }, 'step started')
        await saveReport(reportId, report)
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.error({ err: errMsg }, 'R2 save failed')
      await notifySlack({
        severity: 'critical',
        title: 'R2 save failed for generated report',
        details: { reportId, error: errMsg },
        requestId,
      })

      await step.run('set-failed-status-save', async () => {
        await setJobStatus(jobId, {
          status: 'failed',
          error: 'Failed to save report. Please try again.',
        })
      })

      throw err
    }

    // Step 3b: Render and save the immutable PDF artifact.
    // Non-fatal — the JSON is the source of truth and is already saved.
    // If this step fails, the on-demand PDF route will render-and-cache
    // on first download. We log + page Slack but don't fail the job.
    try {
      await step.run('save-report-pdf', async () => {
        log.info({ event: 'step_started', step: 'save-report-pdf' }, 'step started')
        const today = new Date().toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        const buffer = await renderToBuffer(<ReportPdfDocument report={report} today={today} />)
        await saveReportPdf(reportId, buffer)
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      log.warn({ err: errMsg, reportId }, 'PDF render/save failed; will render on demand')
      await notifySlack({
        severity: 'warning',
        title: 'PDF render/save failed at generation time',
        details: { reportId, error: errMsg },
        requestId,
      })
    }

    // Step 4: Mark job as complete
    await step.run('set-completed-status', async () => {
      log.info({ event: 'step_started', step: 'set-completed-status' }, 'step started')
      await setJobStatus(jobId, {
        status: 'completed',
        reportId,
        preview: report.candidates.slice(0, 3),
        summary: report.summary,
        totalCount: report.candidates.length,
      })
    })

    log.info(
      {
        reportId,
        jobId,
        candidateCount: report.candidates.length,
        durationMs: Date.now() - startedAt,
        event: 'job_completed',
      },
      'Inngest report generation completed'
    )

    return { success: true, reportId }
  }
)
