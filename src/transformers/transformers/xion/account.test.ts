import { describe, expect, it } from 'vitest'

import { ParsedWasmStateEvent } from '@/types'
import { dbKeyForKeys } from '@/utils'

import { hasAuthenticator } from './account'

const makeEvent = (
  overrides: Partial<ParsedWasmStateEvent>
): ParsedWasmStateEvent => ({
  type: 'state',
  codeId: 5,
  contractAddress: 'xion1acct',
  blockHeight: '1',
  blockTimeUnixMs: '1',
  blockTimestamp: new Date(1),
  // cw-storage-plus Map<u8, _> key: length-prefixed namespace + one id byte.
  key: dbKeyForKeys('authenticators', Buffer.from([0])),
  value: '',
  valueJson: null,
  delete: false,
  ...overrides,
})

const getName = (event: ParsedWasmStateEvent) =>
  typeof hasAuthenticator.name === 'string'
    ? hasAuthenticator.name
    : hasAuthenticator.name(event)

describe('xion account hasAuthenticator transformer', () => {
  it('matches authenticators map entries only', () => {
    const { matches } = hasAuthenticator.filter
    expect(matches?.(makeEvent({}))).toBe(true)
    expect(
      matches?.(
        makeEvent({ key: dbKeyForKeys('authenticators', Buffer.from([255])) })
      )
    ).toBe(true)
    expect(matches?.(makeEvent({ key: dbKeyForKeys('contract_info') }))).toBe(
      false
    )
  })

  it('names an added authenticator by its login identity', () => {
    const valueJson = { Jwt: { aud: 'project-1', sub: 'user-1' } }
    expect(
      getName(makeEvent({ value: JSON.stringify(valueJson), valueJson }))
    ).toBe('hasAuthenticator:JWT:project-1.user-1')
  })

  it('does not name removals or unknown variants', () => {
    expect(getName(makeEvent({ delete: true }))).toBeUndefined()
    expect(
      getName(makeEvent({ valueJson: { Future: { thing: 'x' } } }))
    ).toBeUndefined()
  })

  it('skips identities too long to index', () => {
    // Issuer-controlled JWT subject long enough to exceed the btree entry
    // limit; indexing it would fail the whole transformation batch.
    const valueJson = { Jwt: { aud: 'project-1', sub: 'u'.repeat(3000) } }
    expect(getName(makeEvent({ valueJson }))).toBeUndefined()
  })
})
