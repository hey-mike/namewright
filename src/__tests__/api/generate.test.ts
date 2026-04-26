jest.mock('@/inngest/client', () => ({
  inngest: {
    send: jest.fn(),
  },
}))
jest.mock('@/lib/kv', () => ({
  setJobStatus: jest.fn(),
}))
jest.mock('@/lib/env', () => ({
  validateEnv: jest.fn(),
}))

import { inngest } from '@/inngest/client'
import { setJobStatus } from '@/lib/kv'
import { POST } from '@/app/api/generate/route'

function makeRequest(body: object) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/generate', () => {
  beforeEach(() => {
    ;(inngest.send as jest.Mock).mockClear()
    ;(inngest.send as jest.Mock).mockResolvedValue(undefined)
    ;(setJobStatus as jest.Mock).mockClear()
    ;(setJobStatus as jest.Mock).mockResolvedValue(undefined)
  })

  it('dispatches the inngest job and returns jobId and reportId', async () => {
    const req = makeRequest({
      description: 'A note-taking app',
      personality: 'Playful / approachable',
      constraints: '',
      geography: 'US-first',
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.jobId).toBeDefined()
    expect(json.reportId).toBeDefined()
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'report.generate',
        data: expect.objectContaining({
          jobId: json.jobId,
          reportId: json.reportId,
        }),
      })
    )
    expect(setJobStatus).toHaveBeenCalledWith(json.jobId, { status: 'pending' })
  })

  it('returns 400 when required fields are missing', async () => {
    const req = makeRequest({ description: 'only this' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 503 if inngest dispatch fails', async () => {
    ;(inngest.send as jest.Mock).mockRejectedValue(new Error('Inngest unavailable'))

    const req = makeRequest({
      description: 'A note-taking app',
      personality: 'Playful / approachable',
      constraints: '',
      geography: 'US-first',
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
  })
})
