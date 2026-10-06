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

// On xion-mainnet-1 no identity (or JWT subject across audiences) is held by
// more than 32 accounts, so these bounds only stop abusive or broken lookups.
const MAX_CANDIDATES = 1000
const MAP_READ_BATCH_SIZE = 50

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
    description: `Find XION account contracts that currently have the given authenticator (fails if more than ${MAX_CANDIDATES} accounts match)`,
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
          'JWT only: subject to match (optionally with `aud`) when `authenticator` is omitted; must not contain `*` unless `aud` is given',
        required: false,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  // Deterministic per block, but range computation cannot follow it: the index
  // lookup spans all contracts (dependent key `*` for the contract), and
  // `computeRange` only matches future events by exact key, so a range would
  // silently miss authenticators added mid-range. Dynamic formulas are only
  // computed for a single block and never cached.
  dynamic: true,
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
    // getTransformationMatches turns every `*` into `%`, so exact lookups are
    // pinned with `=` and `*` is rejected in sub-only lookups.
    const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&')

    let nameLike: string
    let whereName: WhereOperators | undefined
    let matches: (
      value: XionAuthenticator,
      identity: XionAuthenticatorIdentity
    ) => boolean
    if (authenticator || (type === 'JWT' && sub && aud)) {
      const name = `hasAuthenticator:${type}:${
        authenticator || `${aud}.${sub}`
      }`
      nameLike = escapeLike(name)
      whereName = { [Op.eq]: name }
      matches = authenticator
        ? (_, identity) =>
            identity.type === type && identity.authenticator === authenticator
        : (value) =>
            'Jwt' in value && value.Jwt.sub === sub && value.Jwt.aud === aud
    } else if (type === 'JWT' && sub) {
      if (sub.includes('*')) {
        throw new Error('sub must not contain * unless aud is given')
      }
      nameLike = `hasAuthenticator:JWT:*.${escapeLike(sub)}`
      matches = (value) => 'Jwt' in value && value.Jwt.sub === sub
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
    const indexMatches =
      (await getTransformationMatches(
        undefined,
        nameLike,
        true,
        codeIds,
        whereName,
        MAX_CANDIDATES + 1
      )) ?? []
    if (indexMatches.length > MAX_CANDIDATES) {
      throw new Error(
        `more than ${MAX_CANDIDATES} accounts match; narrow the query`
      )
    }
    const candidates = new Map<string, number>()
    for (const { contractAddress, codeId } of indexMatches) {
      candidates.set(contractAddress, codeId)
    }

    const loadAccount = async ([address, codeId]: [string, number]): Promise<
      XionAccountByAuthenticator | undefined
    > => {
      const authenticatorMap =
        (await getMap<number, XionAuthenticator>(address, 'authenticators', {
          keyType: 'number',
        })) ?? {}

      let found = false
      const authenticators: XionAccountByAuthenticator['authenticators'] = []
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
            authenticators: authenticators.sort((a, b) => a.index - b.index),
          }
        : undefined
    }

    // Re-check candidates against current state in bounded batches.
    const accounts: XionAccountByAuthenticator[] = []
    const candidateList = [...candidates]
    for (let i = 0; i < candidateList.length; i += MAP_READ_BATCH_SIZE) {
      for (const account of await Promise.all(
        candidateList.slice(i, i + MAP_READ_BATCH_SIZE).map(loadAccount)
      )) {
        if (account) {
          accounts.push(account)
        }
      }
    }

    return accounts.sort((a, b) =>
      a.address < b.address ? -1 : a.address > b.address ? 1 : 0
    )
  },
}
