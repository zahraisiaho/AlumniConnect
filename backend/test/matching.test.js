// Unit tests for the rule-based matching function (no database needed).
import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreMatch } from '../src/matching.js'

const amina = { university: 'Strathmore University', fieldOfStudy: 'Computer Science', industry: 'Technology', availability: 'Weekday evenings',
  skills: ['Python', 'React', 'SQL'], interests: ['Career guidance', 'Internships abroad', 'Technical skills'] }
const mentor = (o) => ({ university: '', fieldOfStudy: '', industry: '', availability: '', skills: [], interests: [], ...o })

test('TC-007 worked example: Brian scores 85', () => {
  const r = scoreMatch(amina, mentor({ university: 'University of Nairobi', fieldOfStudy: 'Computer Science', industry: 'Technology', availability: 'Weekday evenings', skills: ['Python', 'Cloud', 'SQL'], interests: ['Technical skills', 'Career guidance'] }))
  assert.equal(r.score, 85)
  assert.ok(r.reasons.length >= 4)
})
test('TC-007 worked example: Daniel 60, Sarah 30, Grace 17', () => {
  const daniel = scoreMatch(amina, mentor({ fieldOfStudy: 'Computer Science', industry: 'Technology', availability: 'Once a month', skills: ['Machine learning', 'Python', 'Leadership'], interests: ['Postgraduate study', 'Technical skills'] }))
  const sarah = scoreMatch(amina, mentor({ fieldOfStudy: 'Design & Media', industry: 'Technology', availability: 'Weekends', skills: ['UI/UX design', 'JavaScript', 'React'], interests: ['Internships abroad', 'CV & interview prep'] }))
  const grace = scoreMatch(amina, mentor({ university: 'Strathmore University', fieldOfStudy: 'Information Technology', industry: 'Telecommunications', availability: 'Weekends', skills: ['Cybersecurity', 'Cloud', 'Leadership'], interests: ['Career guidance', 'Leadership growth'] }))
  assert.deepEqual([daniel.score, sarah.score, grace.score], [60, 30, 17])
})
test('No shared attribute scores zero', () => {
  assert.equal(scoreMatch(amina, mentor({ fieldOfStudy: 'Law', industry: 'Healthcare', skills: ['Research'], interests: ['Networking'] })).score, 0)
})
test('Skill and interest points are capped at 25 each', () => {
  const s = { skills: ['a', 'b', 'c', 'd', 'e'], interests: ['x', 'y', 'z'] }
  assert.equal(scoreMatch(s, { skills: ['a', 'b', 'c', 'd', 'e'], interests: ['x', 'y', 'z'] }).score, 50)
})
test('A perfect match scores exactly 100', () => {
  const p = { university: 'U', fieldOfStudy: 'F', industry: 'I', availability: 'A', skills: ['a', 'b', 'c', 'd'], interests: ['x', 'y', 'z'] }
  assert.equal(scoreMatch(p, p).score, 100)
})
test('Missing student attributes never cause an error', () => {
  assert.equal(scoreMatch({}, mentor({ fieldOfStudy: 'Law' })).score, 0)
})
