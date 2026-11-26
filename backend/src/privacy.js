// Privacy rules: what one member may see of another. Every list in the API goes through viewOf, so the rules are
// enforced on the server, not only in the page.
//
//   visibility 'members' : full profile (never the email address)
//              'limited' : first name, field of study, university and skills only (the default)
//              'hidden'  : not listed in the directory and never suggested as a mentor
// relation of the viewer to the person:
//   'self'      : your own profile, in full
//   'partner'   : you are in an ACTIVE mentorship together, so you always see each other in full
//   'contact'   : you dealt with each other before (an ended mentorship, or a request they sent you):
//                 at least the limited profile, even if they are hidden now, so you know who it is
//   'member'    : anyone else
export const VISIBILITY = ['members', 'limited', 'hidden']
export const DEFAULT_VISIBILITY = 'limited'
export const PRIVACY_NOTICE_VERSION = '2026-11-09'

export const firstName = (name = '') => String(name).trim().split(/\s+/)[0] || ''

// Never shown to anyone else, whatever the visibility.
const PRIVATE = ['email', 'createdAt', 'privacyConsentAt', 'privacyNoticeVersion', 'visibility']

export function fullView(u) {
  const out = { ...u }
  for (const k of PRIVATE) delete out[k]
  return { ...out, profile: 'full' }
}

export function limitedView(u) {
  return { id: u.id, name: firstName(u.name), role: u.role, fieldOfStudy: u.fieldOfStudy ?? null, university: u.university ?? null,
    skills: u.skills || [], mentor: !!u.mentor, profile: 'limited' }
}

// What `relation` may see of user u, or null if u must not appear at all.
export function viewOf(u, relation = 'member') {
  if (relation === 'self' || relation === 'partner') return fullView(u)
  const v = u.visibility || DEFAULT_VISIBILITY
  if (v === 'members') return fullView(u)
  if (v === 'limited' || relation === 'contact') return limitedView(u)
  return null   // hidden
}

// Match reasons may only mention what the viewer is allowed to see. Text similarity says that the goals are alike,
// not what they are, so it stays. The others (interests, industry, availability) are summarised in one line.
const VISIBLE_REASON = /^(Same field of study|Shared skills|Same university|Similar goals in their bios|Profiles describe similar goals|Suggested: no mentor shares)/
export function reasonsFor(reasons, view) {
  if (view.profile === 'full') return reasons
  const shown = reasons.filter((r) => VISIBLE_REASON.test(r))
  return shown.length < reasons.length ? [...shown, 'Other details in their profile also match'] : shown
}

export function visibilityProblem(v) {
  return VISIBILITY.includes(v) ? '' : 'Choose who can see your profile: visible to members, limited or hidden.'
}
