import { GenericFormula } from '@/types'
import {
  XION_ACCOUNT_CODE_IDS_KEY,
  XION_AUTHENTICATOR_TYPES,
  XionAuthenticator,
  XionAuthenticatorIdentity,
  XionAuthenticatorType,
  getXionAuthenticatorIdentity,
} from '@/utils'

export type XionAccountByAuthenticator = {
  address: string
  codeId: number
  authenticators: {
    index: number
    type: XionAuthenticatorType
    authenticator: string
  }[]
}

export const accountsByAuthenticator: GenericFormula<
  XionAccountByAuthenticator[],
  {
    type: string
    authenticator?: string
    aud?: string
    sub?: string
  }
> = {
  docs: {
    description:
      'Find XION account contracts that currently have the given authenticator',
    args: [
      {
        name: 'type',
        description: `Authenticator type: ${XION_AUTHENTICATOR_TYPES.join(
          ', '
        )}`,
        required: true,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'authenticator',
        description:
          'Exact login identity: base64 pubkey (Secp256K1, Ed25519, Secp256R1), 0x address (EthWallet), base64 credential ID (Passkey), email salt (ZKEmail), or `aud.sub` (JWT)',
        required: false,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'aud',
        description:
          'JWT only: audience to match together with `sub` when `authenticator` is omitted',
        required: false,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'sub',
        description:
          'JWT only: subject to match (optionally with `aud`) when `authenticator` is omitted',
        required: false,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  compute: async ({
    args: { type, authenticator, aud, sub },
    getCodeIdsForKeys,
    getTransformationMatches,
    getMap,
  }) => {
    if (!XION_AUTHENTICATOR_TYPES.includes(type as XionAuthenticatorType)) {
      throw new Error('invalid type')
    }
    if (type !== 'JWT' && !authenticator) {
      throw new Error('authenticator is required')
    }
    if (type === 'JWT' && !authenticator && !sub) {
      throw new Error('authenticator or sub is required')
    }

    let nameLike: string
    let matches: (
      value: XionAuthenticator,
      identity: XionAuthenticatorIdentity
    ) => boolean
    if (authenticator) {
      nameLike = `hasAuthenticator:${type}:${authenticator}`
      matches = (_, identity) =>
        identity.type === type && identity.authenticator === authenticator
    } else {
      // JWT matched by `sub` (and optionally `aud`). `*` is a LIKE wildcard,
      // and any `%`/`_` in the input are too, so candidates are re-checked
      // exactly against the stored value below.
      nameLike = `hasAuthenticator:JWT:${aud ?? '*'}.${sub}`
      matches = (value) =>
        'Jwt' in value &&
        value.Jwt.sub === sub &&
        (!aud || value.Jwt.aud === aud)
    }

    const codeIds = getCodeIdsForKeys(XION_ACCOUNT_CODE_IDS_KEY)
    if (!codeIds.length) {
      return []
    }

    // The reverse index records every authenticator ever added, including
    // ones since removed, so it only yields candidates.
    const candidates = new Map<string, number>()
    for (const { contractAddress, codeId } of (await getTransformationMatches(
      undefined,
      nameLike,
      true,
      codeIds
    )) ?? []) {
      candidates.set(contractAddress, codeId)
    }

    const accounts = await Promise.all(
      [...candidates].map(
        async ([address, codeId]): Promise<
          XionAccountByAuthenticator | undefined
        > => {
          const authenticatorMap =
            (await getMap<number, XionAuthenticator>(
              address,
              'authenticators',
              { keyType: 'number' }
            )) ?? {}

          let found = false
          const authenticators: XionAccountByAuthenticator['authenticators'] =
            []
          for (const [index, value] of Object.entries(authenticatorMap)) {
            const identity = getXionAuthenticatorIdentity(value)
            if (!identity) {
              continue
            }

            found ||= matches(value, identity)
            authenticators.push({
              index: Number(index),
              ...identity,
            })
          }

          return found
            ? {
                address,
                codeId,
                authenticators: authenticators.sort(
                  (a, b) => a.index - b.index
                ),
              }
            : undefined
        }
      )
    )

    return accounts
      .filter((account): account is XionAccountByAuthenticator => !!account)
      .sort((a, b) =>
        a.address < b.address ? -1 : a.address > b.address ? 1 : 0
      )
  },
}
