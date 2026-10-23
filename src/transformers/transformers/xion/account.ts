import { Transformer } from '@/types'
import {
  XION_ACCOUNT_CODE_IDS_KEY,
  dbKeyForKeys,
  getXionAuthenticatorIdentity,
} from '@/utils'

const AUTHENTICATORS_PREFIX = dbKeyForKeys('authenticators', '')

// `name` is in btree indexes, whose entries Postgres caps at ~2.7KB; an
// oversized name fails the whole transformation batch in `bulkCreate`.
// Identities are issuer-controlled for JWT (`aud.sub`), so skip absurd ones.
// Real identities are under 200 bytes.
const MAX_NAME_BYTES = 1024

/**
 * Reverse index of account authenticators: one `hasAuthenticator:TYPE:IDENTITY`
 * transformation per authenticator ever added to an account. Removals delete
 * the map entry (`valueJson === null`), which yields no name, so the index
 * means "had this authenticator at some point"; consumers must re-check the
 * account's current `authenticators` map.
 */
export const hasAuthenticator: Transformer<true> = {
  filter: {
    codeIdsKeys: [XION_ACCOUNT_CODE_IDS_KEY],
    matches: (event) => event.key.startsWith(AUTHENTICATORS_PREFIX),
  },
  name: (event) => {
    const identity = getXionAuthenticatorIdentity(event.valueJson)
    if (!identity) {
      return
    }

    const name = `hasAuthenticator:${identity.type}:${identity.authenticator}`
    return Buffer.byteLength(name) <= MAX_NAME_BYTES ? name : undefined
  },
  getValue: () => true,
}

export default [hasAuthenticator]
