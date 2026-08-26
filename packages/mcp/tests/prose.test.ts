// The agent's own commentary is rendered beside the draft, and the house rule forbids the
// dash there as much as anywhere else this product writes.
import { describe, expect, it } from 'vitest'

import { withoutDashes } from '../src/utils/prose.js'

describe('withoutDashes', () => {
  it('replaces an em dash used as punctuation with a comma', () => {
    expect(withoutDashes('The draft is well-formed — factual, and cites each 404.')).toBe(
      'The draft is well-formed, factual, and cites each 404.',
    )
  })

  it('replaces an en dash the same way, spaced or not', () => {
    expect(withoutDashes('two things–one answer')).toBe('two things, one answer')
    expect(withoutDashes('two things – one answer')).toBe('two things, one answer')
  })

  it('leaves hyphens and ranges alone', () => {
    expect(withoutDashes('well-formed, 2020-2024, non-negotiable')).toBe(
      'well-formed, 2020-2024, non-negotiable',
    )
  })

  it('returns empty text untouched', () => {
    expect(withoutDashes('')).toBe('')
  })
})
