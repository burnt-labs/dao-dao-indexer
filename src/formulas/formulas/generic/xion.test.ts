import { describe, expect, it, vi } from 'vitest'

import { Env } from '@/types'

import { accountsByAuthenticator } from './xion'

const ACCOUNT_A = {
  address: 'xion1a',
  codeId: 5,
  authenticators: [
    { index: 0, type: 'JWT', authenticator: 'A.S' },
    { index: 1, type: 'EthWallet', authenticator: '0xab' },
  ],
}
const ACCOUNT_B = {
  address: 'xion1b',
  codeId: 5,
  authenticators: [{ index: 0, type: 'JWT', authenticator: 'B.S' }],
}

// The reverse index is a candidate list: the mocked LIKE query over-matches
// (returns both accounts, `xion1a` twice) so the exact re-check against the
// current authenticators map is what decides the result.
const makeEnv = (
  args: Record<string, string>,
  {
    codeIds = [5],
    candidates = [
      { contractAddress: 'xion1b', codeId: 5 },
      { contractAddress: 'xion1a', codeId: 5 },
      { contractAddress: 'xion1a', codeId: 5 },
    ],
    maps = {
      xion1a: {
        0: { Jwt: { aud: 'A', sub: 'S' } },
        1: { EthWallet: { address: '0xab' } },
      },
      xion1b: { 0: { Jwt: { aud: 'B', sub: 'S' } } },
    },
    getMap = async (address: string) => maps[address],
  }: {
    codeIds?: number[]
    candidates?: { contractAddress: string; codeId: number }[]
    maps?: Record<string, Record<number, unknown> | undefined>
    getMap?: (address: string) => Promise<unknown>
  } = {}
): Env =>
  ({
    args,
    getCodeIdsForKeys: vi.fn(() => codeIds),
    getTransformationMatches: vi.fn(async () => candidates),
    getMap: vi.fn(getMap),
  } as unknown as Env)

describe('generic xion/accountsByAuthenticator', () => {
  it.each([
    [{ type: 'JWT', authenticator: 'A.S' }, [ACCOUNT_A]],
    [{ type: 'EthWallet', authenticator: '0xab' }, [ACCOUNT_A]],
    // Same identity string under a different type does not match.
    [{ type: 'Secp256K1', authenticator: '0xab' }, []],
  ])(
    'returns only accounts that currently hold the exact identity %j',
    async (args, expected) => {
      expect(await accountsByAuthenticator.compute(makeEnv(args))).toEqual(
        expected
      )
    }
  )

  it('matches JWT by sub across audiences, sorted by address', async () => {
    expect(
      await accountsByAuthenticator.compute(makeEnv({ type: 'JWT', sub: 'S' }))
    ).toEqual([ACCOUNT_A, ACCOUNT_B])
  })

  it('narrows a JWT sub match by aud', async () => {
    expect(
      await accountsByAuthenticator.compute(
        makeEnv({ type: 'JWT', sub: 'S', aud: 'B' })
      )
    ).toEqual([ACCOUNT_B])
  })

  it('excludes candidates whose authenticator has since been removed', async () => {
    expect(
      await accountsByAuthenticator.compute(
        makeEnv(
          { type: 'JWT', sub: 'S' },
          {
            maps: {
              xion1a: { 1: { EthWallet: { address: '0xab' } } },
              xion1b: undefined,
            },
          }
        )
      )
    ).toEqual([])
  })

  it('returns no accounts when no account code IDs are tracked', async () => {
    expect(
      await accountsByAuthenticator.compute(
        makeEnv({ type: 'JWT', authenticator: 'A.S' }, { codeIds: [] })
      )
    ).toEqual([])
  })

  it('rejects lookups matching more than 1000 accounts', async () => {
    const candidates = Array.from({ length: 1001 }, (_, i) => ({
      contractAddress: `xion1acct${i}`,
      codeId: 5,
    }))
    const env = makeEnv({ type: 'JWT', sub: 'S' }, { candidates })

    await expect(accountsByAuthenticator.compute(env)).rejects.toThrow(
      'more than 1000 accounts match'
    )
    expect(env.getMap).not.toHaveBeenCalled()
  })

  it('re-checks candidates with at most 50 concurrent state reads', async () => {
    const candidates = Array.from({ length: 120 }, (_, i) => ({
      contractAddress: `xion1acct${i.toString().padStart(3, '0')}`,
      codeId: 5,
    }))
    let inFlight = 0
    let maxInFlight = 0
    const env = makeEnv(
      { type: 'JWT', authenticator: 'A.S' },
      {
        candidates,
        getMap: async () => {
          maxInFlight = Math.max(maxInFlight, ++inFlight)
          // Yield so every read in a batch starts before any finishes.
          await Promise.resolve()
          inFlight--
          return { 0: { Jwt: { aud: 'A', sub: 'S' } } }
        },
      }
    )

    const accounts = await accountsByAuthenticator.compute(env)
    expect(accounts.map(({ address }) => address)).toEqual(
      candidates.map(({ contractAddress }) => contractAddress)
    )
    expect(maxInFlight).toBe(50)
  })

  it.each([
    [{ type: 'Secp256K1' }, 'authenticator is required'],
    [{ type: 'JWT', aud: 'A' }, 'authenticator or sub is required'],
    [{ type: 'JWT', sub: 'S*' }, 'sub must not contain * unless aud is given'],
    [{ type: 'Nope', authenticator: 'x' }, 'invalid type'],
    [{ type: 'Jwt', authenticator: 'A.S' }, 'invalid type'],
    [{ authenticator: 'A.S' }, 'invalid type'],
  ])('rejects args %j', async (args, error) => {
    await expect(
      accountsByAuthenticator.compute(makeEnv(args))
    ).rejects.toThrow(error)
  })
})
