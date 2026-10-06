import { Op, WhereOperators } from 'sequelize'

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
          'JWT only: audience to match together with `sub` when `authenticator` is omitted (must not contain `*`)',
        required: false,
        schema: {
          type: 'string',
        },
      },
      {
        name: 'sub',
        description:
          'JWT only: subject to match (optionally with `aud`) when `authenticator` is omitted (must not contain `*`)',
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

    // Request input must only match itself: `\`, `%` and `_` are escaped with
    // Postgres' default LIKE escape (`\`). `*` cannot be escaped because
    // getTransformationMatches turns every `*` into `%`, so it is rejected in
    // `sub`/`aud`; exact lookups are additionally pinned with `=`.
    const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

    let nameLike: string
    let whereName: WhereOperators | undefined
    let matches: (
      value: XionAuthenticator,
      identity: XionAuthenticatorIdentity
    ) => boolean
    if (authenticator) {
      nameLike = `hasAuthenticator:${type}:${escapeLike(authenticator)}`
      whereName = { [Op.eq]: `hasAuthenticator:${type}:${authenticator}` }
      matches = (_, identity) =>
        identity.type === type && identity.authenticator === authenticator
    } else if (type === 'JWT' && sub) {
      if (sub.includes('*') || aud?.includes('*')) {
        throw new Error('sub and aud must not contain *')
      }

      // Any audience unless `aud` is given; candidates are re-checked exactly
      // against the stored value below.
      nameLike = `hasAuthenticator:JWT:${
        aud ? escapeLike(aud) : '*'
      }.${escapeLike(sub)}`
      matches = (value) =>
        'Jwt' in value &&
        value.Jwt.sub === sub &&
        (!aud || value.Jwt.aud === aud)
    } else {
      throw new Error(
        type === 'JWT'
          ? 'authenticator or sub is required'
          : 'authenticator is required'
      )
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
      codeIds,
      whereName
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
