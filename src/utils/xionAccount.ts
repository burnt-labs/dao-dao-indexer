/**
 * Code IDs key under which XION account contracts are tracked.
 */
export const XION_ACCOUNT_CODE_IDS_KEY = 'xion-account'

// Stored shape of cw-storage-plus Map<u8, Authenticator> "authenticators" in the
// XION account contract (burnt-labs/account-contract src/auth.rs). PascalCase
// variant names come from plain serde Serialize (no rename_all). `ZKEmail`
// exists in newer contract versions (testnet account v0.1.1).
export type XionAuthenticator =
  | { Secp256K1: { pubkey: string } }
  | { Ed25519: { pubkey: string } }
  | { EthWallet: { address: string } }
  | { Jwt: { aud: string; sub: string } }
  | { Secp256R1: { pubkey: string } }
  | { Passkey: { url: string; passkey: string } }
  | { ZKEmail: { email_salt: string; allowed_email_hosts: string[] } }

/**
 * Authenticator type labels, matching `@burnt-labs/signers`
 * `AUTHENTICATOR_TYPE` (plus `Secp256R1`).
 */
export type XionAuthenticatorType =
  | 'Secp256K1'
  | 'Ed25519'
  | 'EthWallet'
  | 'JWT'
  | 'Secp256R1'
  | 'Passkey'
  | 'ZKEmail'

export const XION_AUTHENTICATOR_TYPES: XionAuthenticatorType[] = [
  'Secp256K1',
  'Ed25519',
  'EthWallet',
  'JWT',
  'Secp256R1',
  'Passkey',
  'ZKEmail',
]

export type XionAuthenticatorIdentity = {
  type: XionAuthenticatorType
  /** Login identity string, identical to what xion.js passes to Numia. */
  authenticator: string
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The stored `passkey` is base64 of the JSON-encoded go-webauthn `Credential`
 * returned by xiond's `WebAuthNVerifyRegister`. Its credential ID (Go `[]byte`,
 * so standard padded base64) is what the dashboard uses as the Passkey login
 * identity. The key is `ID` in credentials registered on mainnet (go-webauthn
 * versions without JSON tags) and `id` in current go-webauthn. The full blob is
 * not usable as an identity: it can embed the raw attestation object and run to
 * several KB.
 */
const getPasskeyCredentialId = (passkey: string): string | undefined => {
  try {
    const credential = JSON.parse(Buffer.from(passkey, 'base64').toString())
    if (!isPlainObject(credential)) {
      return
    }

    const id = credential.ID ?? credential.id
    return typeof id === 'string' && id ? id : undefined
  } catch {
    return
  }
}

/**
 * Decode a stored authenticator value into its login identity. Returns
 * undefined for null/non-object values and unknown variants.
 */
export const getXionAuthenticatorIdentity = (
  value: unknown
): XionAuthenticatorIdentity | undefined => {
  if (!isPlainObject(value)) {
    return
  }

  const keys = Object.keys(value)
  if (keys.length !== 1) {
    return
  }

  const variant = keys[0]
  const inner = value[variant]
  if (!isPlainObject(inner)) {
    return
  }

  switch (variant) {
    case 'Secp256K1':
    case 'Ed25519':
    case 'Secp256R1':
      return typeof inner.pubkey === 'string' && inner.pubkey
        ? { type: variant, authenticator: inner.pubkey }
        : undefined
    case 'EthWallet':
      return typeof inner.address === 'string' && inner.address
        ? { type: 'EthWallet', authenticator: inner.address }
        : undefined
    case 'Jwt':
      return typeof inner.aud === 'string' && typeof inner.sub === 'string'
        ? { type: 'JWT', authenticator: `${inner.aud}.${inner.sub}` }
        : undefined
    case 'Passkey': {
      const credentialId =
        typeof inner.passkey === 'string'
          ? getPasskeyCredentialId(inner.passkey)
          : undefined
      return credentialId
        ? { type: 'Passkey', authenticator: credentialId }
        : undefined
    }
    case 'ZKEmail':
      return typeof inner.email_salt === 'string' && inner.email_salt
        ? { type: 'ZKEmail', authenticator: inner.email_salt }
        : undefined
    default:
      return
  }
}
