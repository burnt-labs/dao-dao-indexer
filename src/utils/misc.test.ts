import { describe, expect, it } from 'vitest'

import { bigIntMax, bigIntMin, errorContains } from './misc'

describe('misc utils', () => {
  describe('bigIntMax', () => {
    it('should return the maximum of two bigints', () => {
      expect(bigIntMax(5n, 10n)).toBe(10n)
    })

    it('should return the maximum of multiple bigints', () => {
      expect(bigIntMax(1n, 5n, 3n, 9n, 2n)).toBe(9n)
    })

    it('should handle negative bigints', () => {
      expect(bigIntMax(-10n, -5n, -20n)).toBe(-5n)
    })

    it('should handle very large bigints', () => {
      const large1 = 10n ** 50n
      const large2 = 10n ** 51n
      expect(bigIntMax(large1, large2)).toBe(large2)
    })
  })

  describe('bigIntMin', () => {
    it('should return the minimum of two bigints', () => {
      expect(bigIntMin(5n, 10n)).toBe(5n)
    })

    it('should return the minimum of multiple bigints', () => {
      expect(bigIntMin(1n, 5n, 3n, 9n, 2n)).toBe(1n)
    })

    it('should handle negative bigints', () => {
      expect(bigIntMin(-10n, -5n, -20n)).toBe(-20n)
    })
  })

  describe('errorContains', () => {
    it('should return true when error message contains substring', () => {
      const error = new Error('Connection timeout occurred')
      expect(errorContains(error, 'timeout')).toBe(true)
    })

    it('should be case insensitive', () => {
      const error = new Error('CONNECTION TIMEOUT')
      expect(errorContains(error, 'connection')).toBe(true)
    })

    it('should check multiple substrings', () => {
      const error = new Error('Rate limit exceeded')
      expect(errorContains(error, '429', 'rate limit', 'quota')).toBe(true)
    })

    it('should handle 429 rate limit detection', () => {
      const error = new Error('HTTP 429: Too Many Requests')
      expect(errorContains(error, '429', 'too many requests', 'rate limit exceeded')).toBe(true)
    })
  })
})
