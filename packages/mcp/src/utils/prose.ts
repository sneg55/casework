// Model-authored text on its way to a screen.
//
// The house rule forbids em and en dashes everywhere this product writes, and `npm run
// lint:dashes` enforces it over the repository. A model's own commentary is not in the
// repository, so nothing catches it before it is rendered beside the draft.
const DASHES = /\s*[—–]\s*/g

/** Replace a dash used as punctuation with the comma the house style uses instead. */
export function withoutDashes(text: string): string {
  return text.replace(DASHES, ', ')
}
