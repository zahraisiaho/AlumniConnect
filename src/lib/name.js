// Same rule as backend/src/names.js: any letters (accents included), spaces, hyphens and apostrophes; trim + length only.
export const NAME_MAX = 100
export function nameProblem(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Enter your name.'
  if ([...value.trim()].length > NAME_MAX) return `Your name must be ${NAME_MAX} characters or fewer.`
  return ''
}
