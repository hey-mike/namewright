jest.mock('@/lib/alerts', () => ({
  notifySlack: jest.fn(),
}))

import {
  checkEuipoTrademark,
  checkAllEuipoTrademarks,
  _resetEuipoTokenCacheForTesting,
} from '@/lib/euipo'
import { notifySlack } from '@/lib/alerts'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  _resetEuipoTokenCacheForTesting()
  ;(notifySlack as jest.Mock).mockClear()
  process.env.EUIPO_CLIENT_ID = 'test-client-id'
  process.env.EUIPO_CLIENT_SECRET = 'test-client-secret'
  process.env.EUIPO_AUTH_BASE_URL = 'https://auth.test.example'
  process.env.EUIPO_API_BASE_URL = 'https://api.test.example'
})

afterEach(() => {
  jest.restoreAllMocks()
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

function mockFetch(implementations: Array<(url: string, init?: RequestInit) => Response>) {
  let callIndex = 0
  return jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
    const impl = implementations[callIndex++]
    if (!impl) throw new Error(`Unexpected fetch call #${callIndex} to ${String(input)}`)
    const url = typeof input === 'string' ? input : (input as URL).toString()
    return impl(url, init)
  })
}

function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: 'tok-abc', expires_in: 3600 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Matches EUIPO's real Spring-Data-pageable response shape. Test helpers
// construct live marks (status=REGISTERED) unless the caller overrides.
interface TestMark {
  verbalElement?: string
  applicationNumber?: string
  applicationDate?: string
  status?: string
  niceClasses?: number[]
  applicants?: Array<{ name?: string }>
}

function searchResponse(marks: TestMark[]): Response {
  const trademarks = marks.map((m) => ({
    applicationNumber: m.applicationNumber,
    status: m.status ?? 'REGISTERED',
    niceClasses: m.niceClasses,
    wordMarkSpecification:
      m.verbalElement !== undefined ? { verbalElement: m.verbalElement } : undefined,
    applicationDate: m.applicationDate,
    applicants: m.applicants,
  }))
  return new Response(
    JSON.stringify({
      trademarks,
      page: 0,
      size: 10,
      totalElements: trademarks.length,
      totalPages: 1,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

describe('checkEuipoTrademark', () => {
  it('returns uncertain when credentials are not set', async () => {
    delete process.env.EUIPO_CLIENT_ID
    delete process.env.EUIPO_CLIENT_SECRET

    const fetchSpy = jest.spyOn(global, 'fetch')

    const result = await checkEuipoTrademark('Acme', 42)

    expect(result.risk).toBe('uncertain')
    expect(result.candidateName).toBe('Acme')
    expect(result.sources).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns low risk when EUIPO returns no marks', async () => {
    mockFetch([() => tokenResponse(), () => searchResponse([])])

    const result = await checkEuipoTrademark('Quorient', 42)

    expect(result.risk).toBe('low')
    expect(result.candidateName).toBe('Quorient')
    expect(result.sources).toEqual(['EUIPO direct'])
    expect(result.notes).toContain('No EUIPO conflicts')
  })

  it('returns moderate risk for a single conflict and cites the mark', async () => {
    mockFetch([
      () => tokenResponse(),
      () =>
        searchResponse([
          {
            verbalElement: 'QUORIENT',
            applicationNumber: '017123456',
            applicationDate: '2018-01-15',
          },
        ]),
    ])

    const result = await checkEuipoTrademark('Quorient', 42)

    expect(result.risk).toBe('moderate')
    expect(result.notes).toContain('QUORIENT')
    expect(result.notes).toContain('017123456')
  })

  it('returns high risk and overflow indicator when several conflicts exist', async () => {
    mockFetch([
      () => tokenResponse(),
      () =>
        searchResponse([
          { verbalElement: 'A' },
          { verbalElement: 'B' },
          { verbalElement: 'C' },
          { verbalElement: 'D' },
          { verbalElement: 'E' },
        ]),
    ])

    const result = await checkEuipoTrademark('Q', 42)

    expect(result.risk).toBe('high')
    expect(result.notes).toContain('+2 more')
  })

  it('ignores dead marks (EXPIRED, REFUSED, etc.) when scoring risk', async () => {
    mockFetch([
      () => tokenResponse(),
      () =>
        searchResponse([
          { verbalElement: 'DEAD1', status: 'EXPIRED' },
          { verbalElement: 'DEAD2', status: 'REFUSED' },
          { verbalElement: 'DEAD3', status: 'WITHDRAWN' },
        ]),
    ])

    const result = await checkEuipoTrademark('Q', 42)

    // Only live marks drive risk — these are all dead so the name is clear.
    expect(result.risk).toBe('low')
  })

  it('falls back to uncertain when the token endpoint fails', async () => {
    mockFetch([() => new Response('forbidden', { status: 403 })])

    const result = await checkEuipoTrademark('Quorient', 42)

    expect(result.risk).toBe('uncertain')
    expect(result.notes).toContain('unavailable')
    expect(result.sources).toEqual([])
  })

  it('falls back to uncertain when the search endpoint fails', async () => {
    mockFetch([() => tokenResponse(), () => new Response('server error', { status: 500 })])

    const result = await checkEuipoTrademark('Quorient', 42)

    expect(result.risk).toBe('uncertain')
    expect(result.notes).toContain('unavailable')
  })

  it('caches the token across multiple candidate checks', async () => {
    const fetchSpy = mockFetch([
      () => tokenResponse(),
      () => searchResponse([]),
      () => searchResponse([]),
      () => searchResponse([]),
    ])

    await checkEuipoTrademark('A', 42)
    await checkEuipoTrademark('B', 42)
    await checkEuipoTrademark('C', 42)

    // 1 token + 3 search calls = 4 total. If the token weren't cached, we'd see 6.
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it('sends auth headers and form-encoded credentials in the token request', async () => {
    let capturedTokenInit: RequestInit | undefined
    let capturedSearchInit: RequestInit | undefined
    mockFetch([
      (_url, init) => {
        capturedTokenInit = init
        return tokenResponse()
      },
      (_url, init) => {
        capturedSearchInit = init
        return searchResponse([])
      },
    ])

    await checkEuipoTrademark('Quorient', 42)

    expect(capturedTokenInit?.method).toBe('POST')
    const tokenBody = capturedTokenInit?.body as URLSearchParams
    expect(tokenBody.get('client_id')).toBe('test-client-id')
    expect(tokenBody.get('client_secret')).toBe('test-client-secret')
    expect(tokenBody.get('grant_type')).toBe('client_credentials')
    expect(tokenBody.get('scope')).toBe('uid')

    const searchHeaders = capturedSearchInit?.headers as Record<string, string>
    expect(searchHeaders.Authorization).toBe('Bearer tok-abc')
    expect(searchHeaders['X-IBM-Client-Id']).toBe('test-client-id')
  })

  it('fires a Slack alert exactly once when the token endpoint fails', async () => {
    mockFetch([
      () =>
        new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
    ])

    await checkEuipoTrademark('Quorient', 42)

    expect(notifySlack).toHaveBeenCalledTimes(1)
    const call = (notifySlack as jest.Mock).mock.calls[0][0] as {
      severity: string
      title: string
    }
    expect(call.title).toContain('EUIPO OAuth token fetch failing')
    expect(call.severity).toBe('warning')
  })

  it('does NOT fire a Slack alert when only the search phase fails', async () => {
    mockFetch([() => tokenResponse(), () => new Response('server error', { status: 500 })])

    const result = await checkEuipoTrademark('Quorient', 42)

    expect(notifySlack).not.toHaveBeenCalled()
    expect(result.risk).toBe('uncertain')
  })

  it('treats CANCELLATION_PENDING as a live status that drives risk', async () => {
    mockFetch([
      () => tokenResponse(),
      () =>
        searchResponse([
          {
            verbalElement: 'QUORIENT',
            applicationNumber: '017123456',
            status: 'CANCELLATION_PENDING',
          },
        ]),
    ])

    const result = await checkEuipoTrademark('Q', 42)

    // Single live mark = moderate per scoreFromMarks. Guards against someone
    // removing CANCELLATION_PENDING from LIVE_STATUSES.
    expect(result.risk).toBe('moderate')
  })

  it('treats OPPOSITION_PENDING as a live status that drives risk', async () => {
    mockFetch([
      () => tokenResponse(),
      () =>
        searchResponse([
          {
            verbalElement: 'QUORIENT',
            applicationNumber: '017654321',
            status: 'OPPOSITION_PENDING',
          },
        ]),
    ])

    const result = await checkEuipoTrademark('Q', 42)

    expect(result.risk).toBe('moderate')
  })
})

describe('checkAllEuipoTrademarks', () => {
  it('returns a map keyed by candidate name', async () => {
    mockFetch([
      () => tokenResponse(),
      () => searchResponse([]),
      () => searchResponse([{ verbalElement: 'BETA' }]),
    ])

    const result = await checkAllEuipoTrademarks([{ name: 'Alpha' }, { name: 'Beta' }], 42)

    expect(result.get('Alpha')?.risk).toBe('low')
    expect(result.get('Beta')?.risk).toBe('moderate')
  })

  it('preserves names in the output map even when individual checks fail', async () => {
    delete process.env.EUIPO_CLIENT_ID
    delete process.env.EUIPO_CLIENT_SECRET

    const result = await checkAllEuipoTrademarks([{ name: 'Alpha' }, { name: 'Beta' }], 42)

    expect(result.get('Alpha')?.candidateName).toBe('Alpha')
    expect(result.get('Beta')?.candidateName).toBe('Beta')
    expect(result.get('Alpha')?.risk).toBe('uncertain')
  })
})
