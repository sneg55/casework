// Model-authored text on its way to a screen.
//
// The house rule forbids em and en dashes everywhere this product writes, and `npm run
// lint:dashes` enforces it over the repository. A model's own commentary is not in the
// repository, so nothing catches it before it is rendered beside the draft.
// Escaped, so this file passes the dash guard it exists to enforce.
const DASHES = /\s*[\u2014\u2013]\s*/g
// Emphasis markers and code fences a chat client would have rendered. The gate is not a chat
// client, so they arrive as literal asterisks and backticks in the middle of a sentence.
const MARKUP = /(\*\*|__|`)/g
const BLANK_LINES = /\n{3,}/g

/** Replace a dash used as punctuation with the comma the house style uses instead. */
export function withoutDashes(text: string): string {
  return text.replace(DASHES, ', ')
}

/** What the agent said, as the gate should show it: no dashes, no unrendered markdown. */
export function readable(text: string): string {
  return withoutDashes(text).replace(MARKUP, '').replace(BLANK_LINES, '\n\n').trim()
}
