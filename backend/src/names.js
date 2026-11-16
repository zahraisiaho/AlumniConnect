// Names are free text: any letters (including accented ones), spaces, hyphens and apostrophes are allowed.
// The only rules are trimming and length, counted in characters (so "Zoë" is 3), never a character whitelist.
export const NAME_MAX = 100

// Returns the error message for a name, or '' if it is fine.
export function nameProblem(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Name is required.'
  if ([...value.trim()].length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`
  return ''
}
export const cleanName = (value) => value.trim()
