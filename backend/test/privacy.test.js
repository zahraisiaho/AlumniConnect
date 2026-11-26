// Unit tests: what one member may see of another (privacy.js). No database needed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { viewOf, reasonsFor, firstName, visibilityProblem } from '../src/privacy.js'

const u = { id: 7, name: 'Zoë-Anne O’Neill Wanjiru', email: 'z@x.com', role: 'alumnus', university: 'KCA University', course: 'LLB', fieldOfStudy: 'Law',
  gradYear: 2015, industry: 'Legal Services', jobTitle: 'Advocate', company: 'Firm', availability: 'Weekends', bio: 'Bio', mentor: true,
  createdAt: 'x', privacyConsentAt: 'x', privacyNoticeVersion: 'v', skills: ['Legal research'], interests: ['Networking'] }

test('members: full profile but never the email, consent or visibility setting', () => {
  const v = viewOf({ ...u, visibility: 'members' })
  assert.equal(v.company, 'Firm'); assert.equal(v.profile, 'full')
  for (const k of ['email', 'createdAt', 'privacyConsentAt', 'privacyNoticeVersion', 'visibility']) assert.ok(!(k in v), k)
})

test('limited: first name, field, university and skills only', () => {
  const v = viewOf({ ...u, visibility: 'limited' })
  assert.deepEqual(v, { id: 7, name: 'Zoë-Anne', role: 'alumnus', fieldOfStudy: 'Law', university: 'KCA University', skills: ['Legal research'], mentor: true, profile: 'limited' })
})

test('hidden: nothing for members, limited for past contacts, full for self and active partners', () => {
  const h = { ...u, visibility: 'hidden' }
  assert.equal(viewOf(h, 'member'), null)
  assert.equal(viewOf(h, 'contact').profile, 'limited')
  assert.equal(viewOf(h, 'partner').company, 'Firm'); assert.equal(viewOf(h, 'self').company, 'Firm')
  assert.equal(viewOf({ ...u, visibility: 'limited' }, 'partner').profile, 'full')
  assert.equal(viewOf({ ...u, visibility: undefined }).profile, 'limited')   // default
})

test('reasons for a limited profile only mention what may be seen', () => {
  const reasons = ['Same field of study: Law', 'Shared skills: Legal research', 'Shared mentorship interests: Networking', 'Works in Legal Services', 'Both available: Weekends', 'Same university', 'Similar goals in their bios (60% similar)']
  assert.deepEqual(reasonsFor(reasons, { profile: 'full' }), reasons)
  assert.deepEqual(reasonsFor(reasons, { profile: 'limited' }), ['Same field of study: Law', 'Shared skills: Legal research', 'Same university', 'Similar goals in their bios (60% similar)', 'Other details in their profile also match'])
  assert.deepEqual(reasonsFor(['Same university'], { profile: 'limited' }), ['Same university'])
  const none = ['Suggested: no mentor shares your field, skills or interests yet']   // says nothing about the mentor's hidden details
  assert.deepEqual(reasonsFor(none, { profile: 'limited' }), none)
})

test('first names and visibility values', () => {
  assert.equal(firstName('  Amina  Yusuf '), 'Amina'); assert.equal(firstName(''), '')
  assert.equal(visibilityProblem('hidden'), ''); assert.ok(visibilityProblem('public'))
})
