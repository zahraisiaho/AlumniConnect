// Unit tests for the rule-based matching function (no database needed).
import test from 'node:test'
import assert from 'node:assert/strict'
import { SEMANTIC_BONUS, scoreMatch, semanticBonus, semanticOn, rankMatches, profileComplete, NO_OVERLAP_REASON } from '../src/matching.js'

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

test('text-meaning bonus: nothing at or below 0.2 similarity, full 15 points from 0.8, rounded in between', () => {
  assert.deepEqual([0, 0.2, 0.5, 0.68, 0.8, 1].map((s) => semanticBonus(s)), [0, 0, 8, 12, 15, 15])
  assert.equal(semanticBonus(undefined), 0); assert.equal(semanticBonus(NaN), 0)
  assert.deepEqual(SEMANTIC_BONUS, { maxBonus: 15, floor: 0.2, span: 0.6 })
})

test('MATCH_SEMANTIC is on by default and only "off" turns it off', () => {
  assert.equal(semanticOn({}), true); assert.equal(semanticOn({ MATCH_SEMANTIC: 'on' }), true)
  assert.equal(semanticOn({ MATCH_SEMANTIC: 'off' }), false); assert.equal(semanticOn({ MATCH_SEMANTIC: ' OFF ' }), false)
})

const scored = (name, score, extra = {}) => ({ mentor: { name }, score, ruleScore: score, reasons: score ? ['Shared skills: Python'] : [], method: 'rules', ...extra })
const complete = { fieldOfStudy: 'Law', skills: ['Legal research'], interests: ['Networking'] }

test('rankMatches keeps mentors with something in common, best first, at most 10', () => {
  assert.deepEqual(rankMatches([scored('Amy', 0), scored('Ben', 30), scored('Cal', 60)], complete).map((x) => x.mentor.name), ['Cal', 'Ben'])
  assert.equal(rankMatches(Array.from({ length: 15 }, (_, i) => scored(`M${i}`, i + 1)), complete).length, 10)
  const learned = (name, score, similarity) => scored(name, score, { ruleScore: 0, similarity, reasons: [], method: 'hybrid-learned' })
  assert.deepEqual(rankMatches([learned('Amy', 40, 0.5), learned('Ben', 50, 0.1)], complete).map((x) => x.mentor.name), ['Amy'])   // Ben: nothing in common
})

test('rankMatches: a complete profile with nothing in common with any mentor still gets every mentor ranked, with a reason', () => {
  const list = rankMatches([scored('Ben', 0), scored('Amy', 0)], complete)
  assert.deepEqual(list.map((x) => x.mentor.name), ['Amy', 'Ben'])
  assert.ok(list.every((x) => x.reasons.includes(NO_OVERLAP_REASON)))
  const learned = rankMatches([scored('Amy', 11, { ruleScore: 0, similarity: 0, reasons: [], method: 'hybrid-learned' }), scored('Ben', 14, { ruleScore: 0, similarity: 0.1, reasons: [], method: 'hybrid-learned' })], complete)
  assert.deepEqual(learned.map((x) => [x.mentor.name, x.score]), [['Ben', 14], ['Amy', 11]])   // ordered by the learned score
})

test('rankMatches: an incomplete profile gets an empty list (the page asks for field, skills and interests)', () => {
  assert.equal(profileComplete(complete), true)
  for (const partial of [{}, null, { fieldOfStudy: 'Law', skills: ['A'] }, { fieldOfStudy: 'Law', interests: ['B'] }, { skills: ['A'], interests: ['B'] }, { ...complete, skills: [] }]) {
    assert.equal(profileComplete(partial), false)
    assert.deepEqual(rankMatches([scored('Amy', 0)], partial), [])
  }
})
