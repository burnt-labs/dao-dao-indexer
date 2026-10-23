import { fromBech32, toBech32 } from '@cosmjs/encoding'

const BECH32_PREFIX = 'xion'

// Returns the canonical (lowercase) form of a valid Bech32 address for this
// chain, or null if invalid. Both encodings accepted by the Bech32 spec
// (lowercase and uppercase) decode to the same canonical form, so storing and
// querying with this value keeps lookups consistent regardless of client
// casing.
export const canonicalizeAddress = (address: unknown): string | null => {
  if (typeof address !== 'string') {
    return null
  }

  try {
    const { prefix, data } = fromBech32(address.trim())
    return prefix === BECH32_PREFIX ? toBech32(prefix, data) : null
  } catch {
    return null
  }
}
