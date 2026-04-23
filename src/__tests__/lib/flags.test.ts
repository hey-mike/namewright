const mockVariation = jest.fn()
const mockWaitForInit = jest.fn()
const mockInit = jest.fn()

jest.mock('@launchdarkly/node-server-sdk', () => ({
  __esModule: true,
  init: (...args: unknown[]) => {
    mockInit(...args)
    return {
      variation: (...vargs: unknown[]) => mockVariation(...vargs),
      waitForInitialization: (...wargs: unknown[]) => mockWaitForInit(...wargs),
    }
  },
}))

import { isFlagEnabled, _resetFlagsForTesting } from '@/lib/flags'

const ORIGINAL_KEY = process.env.LAUNCHDARKLY_SDK_KEY

beforeEach(() => {
  mockVariation.mockReset()
  mockWaitForInit.mockReset()
  mockInit.mockReset()
  _resetFlagsForTesting()
})

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.LAUNCHDARKLY_SDK_KEY
  else process.env.LAUNCHDARKLY_SDK_KEY = ORIGINAL_KEY
})

describe('isFlagEnabled', () => {
  it('returns the default when LAUNCHDARKLY_SDK_KEY is not set', async () => {
    delete process.env.LAUNCHDARKLY_SDK_KEY

    const result = await isFlagEnabled('any-flag', { key: 'req-1' }, false)

    expect(result).toBe(false)
    expect(mockInit).not.toHaveBeenCalled()
  })

  it('returns the variation value when LD is initialized', async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = 'sdk-test-key'
    mockWaitForInit.mockResolvedValue(undefined)
    mockVariation.mockResolvedValue(true)

    const result = await isFlagEnabled('euipo-direct-cross-check', { key: 'req-2' }, false)

    expect(result).toBe(true)
    expect(mockInit).toHaveBeenCalledWith('sdk-test-key')
    expect(mockVariation).toHaveBeenCalledWith(
      'euipo-direct-cross-check',
      expect.objectContaining({ kind: 'request', key: 'req-2' }),
      false
    )
  })

  it('returns the default when LD init times out', async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = 'sdk-test-key'
    mockWaitForInit.mockRejectedValue(new Error('init timeout'))

    const result = await isFlagEnabled('any-flag', { key: 'req-3' }, true)

    expect(result).toBe(true)
    expect(mockVariation).not.toHaveBeenCalled()
  })

  it('returns the default when variation throws', async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = 'sdk-test-key'
    mockWaitForInit.mockResolvedValue(undefined)
    mockVariation.mockRejectedValue(new Error('flag eval failed'))

    const result = await isFlagEnabled('any-flag', { key: 'req-4' }, false)

    expect(result).toBe(false)
  })

  it('forwards additional context attributes to LD', async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = 'sdk-test-key'
    mockWaitForInit.mockResolvedValue(undefined)
    mockVariation.mockResolvedValue(false)

    await isFlagEnabled(
      'any-flag',
      { key: 'req-5', attributes: { plan: 'paid', region: 'eu' } },
      false
    )

    expect(mockVariation).toHaveBeenCalledWith(
      'any-flag',
      expect.objectContaining({ kind: 'request', key: 'req-5', plan: 'paid', region: 'eu' }),
      false
    )
  })

  it('only initializes the LD client once across multiple calls', async () => {
    process.env.LAUNCHDARKLY_SDK_KEY = 'sdk-test-key'
    mockWaitForInit.mockResolvedValue(undefined)
    mockVariation.mockResolvedValue(true)

    await isFlagEnabled('flag-1', { key: 'req-a' }, false)
    await isFlagEnabled('flag-2', { key: 'req-b' }, false)
    await isFlagEnabled('flag-3', { key: 'req-c' }, false)

    expect(mockInit).toHaveBeenCalledTimes(1)
  })
})
