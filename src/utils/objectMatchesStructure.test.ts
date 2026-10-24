import { describe, expect, it } from 'vitest'

import { objectMatchesStructure } from './objectMatchesStructure'

describe('objectMatchesStructure', () => {
  it('should return true for object matching simple structure', () => {
    const obj = { name: 'test', value: 42 }
    const structure = { name: {}, value: {} }
    expect(objectMatchesStructure(obj, structure)).toBe(true)
  })

  it('should return false when object is missing required key', () => {
    const obj = { name: 'test' }
    const structure = { name: {}, value: {} }
    expect(objectMatchesStructure(obj, structure)).toBe(false)
  })

  it('should return true for matching nested structure', () => {
    const obj = { user: { name: 'test', profile: { age: 25 } } }
    const structure = { user: { name: {}, profile: { age: {} } } }
    expect(objectMatchesStructure(obj, structure)).toBe(true)
  })

  it('should return false for null input', () => {
    expect(objectMatchesStructure(null, { key: {} })).toBe(false)
  })

  it('should return false for array input', () => {
    expect(objectMatchesStructure(['a', 'b'], { 0: {} })).toBe(false)
  })

  it('should return true with ignoreNullUndefined option', () => {
    const obj = { name: null }
    const structure = { name: {} }
    expect(objectMatchesStructure(obj, structure, { ignoreNullUndefined: true })).toBe(true)
  })
})
