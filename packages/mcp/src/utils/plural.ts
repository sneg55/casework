// Counted nouns and the verbs that follow them. These strings are read by a transit authority
// in a message this product drafts, so "1 entry or entries" is not a rough edge, it is the
// sentence that tells the reader nobody wrote this.

/** `2 entries`, `1 entry`. */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${String(n)} ${n === 1 ? singular : plural}`
}

/** The verb form that agrees with `n`: `verb(1, 'point')` is `points`. */
export function verb(n: number, base: string, thirdPerson = `${base}s`): string {
  return n === 1 ? thirdPerson : base
}
