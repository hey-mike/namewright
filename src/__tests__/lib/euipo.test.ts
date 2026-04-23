import {
  checkEuipoTrademark,
  checkAllEuipoTrademarks,
  _resetEuipoTokenCacheForTesting,
} from '@/lib/euipo'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  _resetEuipoTokenCacheForTesting()
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

function searchResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
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
            mark_text: 'QUORIENT',
            registration_number: '017123456',
            filing_date: '2018-01-15',
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
          { mark_text: 'A' },
          { mark_text: 'B' },
          { mark_text: 'C' },
          { mark_text: 'D' },
          { mark_text: 'E' },
        ]),
    ])

    const result = await checkEuipoTrademark('Q', 42)

    expect(result.risk).toBe('high')
    expect(result.notes).toContain('+2 more')
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
})

describe('checkAllEuipoTrademarks', () => {
  it('returns a map keyed by candidate name', async () => {
    mockFetch([
      () => tokenResponse(),
      () => searchResponse([]),
      () => searchResponse([{ mark_text: 'BETA' }]),
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
