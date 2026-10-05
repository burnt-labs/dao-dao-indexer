import { Transformer } from '@/types'
import {
  XION_ACCOUNT_CODE_IDS_KEY,
  dbKeyForKeys,
  getXionAuthenticatorIdentity,
} from '@/utils'

const AUTHENTICATORS_PREFIX = dbKeyForKeys('authenticators', '')

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
    return (
      identity && `hasAuthenticator:${identity.type}:${identity.authenticator}`
    )
  },
  getValue: () => true,
}

export default [hasAuthenticator]
