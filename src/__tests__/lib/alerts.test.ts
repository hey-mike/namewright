import { notifySlack } from '@/lib/alerts'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  jest.restoreAllMocks()
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('notifySlack', () => {
  it('returns silently when SLACK_ALERT_WEBHOOK_URL is unset', async () => {
    delete process.env.SLACK_ALERT_WEBHOOK_URL
    const fetchSpy = jest.spyOn(global, 'fetch')

    await notifySlack({ severity: 'critical', title: 'something broke' })

    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts to the webhook URL when set with severity emoji + title', async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = 'https://hooks.slack.example/xyz'
    let captured: { url: string; body: string } | null = null
    jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
      captured = {
        url: typeof input === 'string' ? input : (input as URL).toString(),
        body: typeof init?.body === 'string' ? init.body : '',
      }
      return new Response('ok', { status: 200 })
    })

    await notifySlack({
      severity: 'critical',
      title: 'KV save failed',
      requestId: 'req-abc',
      details: { reportId: 'rpt-123' },
    })

    expect(captured?.url).toBe('https://hooks.slack.example/xyz')
    const parsed = JSON.parse(captured?.body ?? '{}')
    expect(parsed.text).toContain(':rotating_light:')
    expect(parsed.text).toContain('KV save failed')
    expect(parsed.text).toContain('req-abc')
    expect(parsed.text).toContain('rpt-123')
  })

  it('does not throw when the webhook returns a non-2xx response', async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = 'https://hooks.slack.example/xyz'
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('forbidden', { status: 403 }))

    await expect(notifySlack({ severity: 'warning', title: 'something' })).resolves.toBeUndefined()
  })

  it('does not throw when fetch itself rejects', async () => {
    process.env.SLACK_ALERT_WEBHOOK_URL = 'https://hooks.slack.example/xyz'
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'))

    await expect(notifySlack({ severity: 'warning', title: 'something' })).resolves.toBeUndefined()
  })
})
