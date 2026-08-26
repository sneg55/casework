// Counted nouns and their verbs. These appear in a message sent to a transit authority.
import { describe, expect, it } from 'vitest'

import { count, verb } from '../src/utils/plural.js'

describe('count', () => {
  it('agrees at one and at many', () => {
    expect(count(1, 'feed')).toBe('1 feed')
    expect(count(2, 'feed')).toBe('2 feeds')
    expect(count(0, 'feed')).toBe('0 feeds')
  })

  it('takes an irregular plural', () => {
    expect(count(1, 'entry', 'entries')).toBe('1 entry')
    expect(count(6, 'entry', 'entries')).toBe('6 entries')
    expect(count(1, 'directory', 'directories')).toBe('1 directory')
  })
})

describe('verb', () => {
  it('agrees with the count, not with the noun', () => {
    expect(verb(1, 'point')).toBe('points')
    expect(verb(2, 'point')).toBe('point')
    expect(verb(1, 'do', 'does')).toBe('does')
    expect(verb(3, 'do', 'does')).toBe('do')
  })
})

describe('the sentences these were written for', () => {
  it('never renders the template artifact the critique found', () => {
    const one = `${count(1, 'entry', 'entries')} still ${verb(1, 'point')} at it`
    expect(one).toBe('1 entry still points at it')
    expect(one).not.toContain('entry or entries')
    const many = `${count(6, 'entry', 'entries')} still ${verb(6, 'point')} at it`
    expect(many).toBe('6 entries still point at it')
  })
})
