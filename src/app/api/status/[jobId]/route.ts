import { getJobStatus } from '@/lib/kv'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params

  if (!jobId) {
    return new Response('Missing jobId', { status: 400 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: unknown) => {
        try {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Stream might be closed by client
        }
      }

      let isFinished = false

      while (!isFinished && !req.signal.aborted) {
        try {
          const status = await getJobStatus(jobId)

          if (!status) {
            sendEvent({ status: 'failed', error: 'Job not found or expired' })
            isFinished = true
            break
          }

          sendEvent(status)

          if (status.status === 'completed' || status.status === 'failed') {
            isFinished = true
            break
          }
        } catch (error) {
          logger.error(
            {
              jobId,
              route: 'status-sse',
              err: error instanceof Error ? error.message : String(error),
            },
            'failed to get job status'
          )
          sendEvent({ status: 'failed', error: 'Internal Server Error' })
          isFinished = true
          break
        }

        // Wait 3 seconds before checking again
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }

      try {
        controller.close()
      } catch {
        // Stream already closed
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
