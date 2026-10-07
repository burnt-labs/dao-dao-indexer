import { describe, expect, it, vi } from 'vitest'

import { contractFormulas } from '@/formulas/formulas'
import { ContractEnv } from '@/types'

import { authenticatorIdentities } from './account'

const PASSKEY = Buffer.from(JSON.stringify({ ID: 'abc' })).toString('base64')

const makeEnv = (map: Record<number, unknown> | undefined): ContractEnv =>
  ({
    contractAddress: 'xion1account',
    getMap: vi.fn(async () => map),
  } as unknown as ContractEnv)

describe('contract xion/account/authenticatorIdentities', () => {
  it('is served at contract/{address}/xion/account/authenticatorIdentities', () => {
    expect(contractFormulas.xion.account.authenticatorIdentities).toBe(
      authenticatorIdentities
    )
  })

  it('returns each decoded identity with its index in numeric order', async () => {
    const env = makeEnv({
      0: { Jwt: { aud: 'aud', sub: 'sub' } },
      1: { EthWallet: { address: '0xab' } },
      10: { Secp256K1: { pubkey: 'A1b2+/=' } },
      2: { Passkey: { url: 'https://example.com', passkey: PASSKEY } },
    })

    expect(await authenticatorIdentities.compute(env)).toEqual([
      { index: 0, type: 'JWT', authenticator: 'aud.sub' },
      { index: 1, type: 'EthWallet', authenticator: '0xab' },
      { index: 2, type: 'Passkey', authenticator: 'abc' },
      { index: 10, type: 'Secp256K1', authenticator: 'A1b2+/=' },
    ])
    expect(env.getMap).toHaveBeenCalledWith('xion1account', 'authenticators', {
      keyType: 'number',
    })
  })

  it('omits authenticators that cannot be decoded', async () => {
    expect(
      await authenticatorIdentities.compute(
        makeEnv({
          0: { Unknown: { value: 'x' } },
          1: { Passkey: { url: 'https://example.com', passkey: 'not-json' } },
          2: { Ed25519: { pubkey: 'ed' } },
        })
      )
    ).toEqual([{ index: 2, type: 'Ed25519', authenticator: 'ed' }])
  })

  it.each([
    ['an empty map', {}],
    ['a missing map', undefined],
  ])('returns no identities for %s', async (_, map) => {
    expect(await authenticatorIdentities.compute(makeEnv(map))).toEqual([])
  })
})
