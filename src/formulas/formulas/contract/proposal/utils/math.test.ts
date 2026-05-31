import { describe, it, expect } from 'vitest'
import { compareVoteCount, doesVoteCountPass, doesVoteCountFail } from './math'

describe('math utils', () => {
  it('compareVoteCount with simple percent strings', () => {
    expect(compareVoteCount(51n, '>', 100n, '0.5')).toBe(true)
    expect(compareVoteCount(50n, '>=', 100n, '0.5')).toBe(true)
    expect(compareVoteCount(49n, '>', 100n, '0.5')).toBe(false)
  })

  it('doesVoteCountPass with majority', () => {
    expect(doesVoteCountPass(6n, 10n, { majority: true })).toBe(true)
    expect(doesVoteCountPass(5n, 10n, { majority: true })).toBe(false)
  })

  it('doesVoteCountFail with majority', () => {
    expect(doesVoteCountFail(5n, 10n, { majority: true })).toBe(true)
    expect(doesVoteCountFail(4n, 10n, { majority: true })).toBe(false)
  })

  it('doesVoteCountPass with percent threshold', () => {
    expect(doesVoteCountPass(6n, 10n, { percent: '0.6' })).toBe(true)
    expect(doesVoteCountPass(5n, 10n, { percent: '0.6' })).toBe(false)
  })

  it('doesVoteCountFail with percent threshold', () => {
    expect(doesVoteCountFail(5n, 10n, { percent: '0.6' })).toBe(true)
    expect(doesVoteCountFail(4n, 10n, { percent: '0.6' })).toBe(false)
  })
})
