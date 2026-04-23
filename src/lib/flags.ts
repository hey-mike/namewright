import * as LaunchDarkly from '@launchdarkly/node-server-sdk'
import logger from './logger'

// Init timeout kept short so a slow LD bootstrap can't hang a serverless cold
// start — if init misses the window, the SDK keeps initializing in the
// background and `variation()` will return the default until it's ready.
const INIT_TIMEOUT_SECONDS = 5

let _client: LaunchDarkly.LDClient | null = null
let _initPromise: Promise<LaunchDarkly.LDClient | null> | null = null

async function getClient(): Promise<LaunchDarkly.LDClient | null> {
  if (_client) return _client
  if (_initPromise) return _initPromise

  const key = process.env.LAUNCHDARKLY_SDK_KEY
  if (!key) return null

  _initPromise = (async () => {
    try {
      const client = LaunchDarkly.init(key)
      await client.waitForInitialization({ timeout: INIT_TIMEOUT_SECONDS })
      _client = client
      return client
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'LaunchDarkly init failed — flags will return defaults'
      )
      _initPromise = null
      return null
    }
  })()

  return _initPromise
}

export interface FlagContext {
  /** Stable identifier for the evaluation (e.g. requestId) */
  key: string
  /** Optional attributes for targeting rules */
  attributes?: Record<string, string | number | boolean>
}

function toLdContext(ctx: FlagContext): LaunchDarkly.LDContext {
  return {
    kind: 'request',
    key: ctx.key,
    ...(ctx.attributes ?? {}),
  }
}

/**
 * Returns the boolean variation of `flagKey` for the given context.
 * Falls back to `defaultValue` when:
 *   - LAUNCHDARKLY_SDK_KEY is not set
 *   - SDK init failed or timed out
 *   - The flag itself is unknown to LaunchDarkly
 *   - Any error occurs during evaluation
 */
export async function isFlagEnabled(
  flagKey: string,
  context: FlagContext,
  defaultValue: boolean
): Promise<boolean> {
  const client = await getClient()
  if (!client) return defaultValue

  try {
    return await client.variation(flagKey, toLdContext(context), defaultValue)
  } catch (err) {
    logger.warn(
      { flagKey, err: err instanceof Error ? err.message : String(err) },
      'flag evaluation failed — returning default'
    )
    return defaultValue
  }
}

/**
 * Test-only helper. Resets the singleton so tests can re-init with mocks.
 * No-op outside of test environment.
 */
export function _resetFlagsForTesting(): void {
  if (process.env.NODE_ENV !== 'test') return
  _client = null
  _initPromise = null
}
