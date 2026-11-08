// Unit tests: pair features, the learned-model scorer, model loading and the text-similarity fallback. No database needed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FEATURES, pairFeatures, predict, validModel, loadModel } from '../src/hybrid.js'
import { lexicalEmbedder, cosine } from '../src/embeddings.js'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/model_fixture.json', import.meta.url)))
const amina = { university: 'Strathmore University', fieldOfStudy: 'Computer Science', industry: 'Technology', availability: 'Weekday evenings', skills: ['Python', 'React', 'SQL'], interests: ['Career guidance', 'Internships abroad', 'Technical skills'] }
const brian = { university: 'University of Nairobi', fieldOfStudy: 'Computer Science', industry: 'Technology', availability: 'Weekday evenings', skills: ['Python', 'Cloud', 'SQL'], interests: ['Technical skills', 'Career guidance'] }

test('pair features are scaled 0..1 and match the worked example', () => {
  const f = pairFeatures(amina, brian, 0.4)
  assert.deepEqual(Object.keys(f), FEATURES)
  assert.equal(f.field_match, 1); assert.equal(f.industry_match, 1); assert.equal(f.availability_match, 1); assert.equal(f.same_university, 0)
  assert.ok(Math.abs(f.skills_shared - 2 / 3) < 1e-12); assert.ok(Math.abs(f.interests_shared - 2 / 3) < 1e-12); assert.equal(f.semantic_sim, 0.4)
  assert.ok(Object.values(f).every((x) => x >= 0 && x <= 1))
})

test('similarity is clipped to 0..1 and missing text counts as zero', () => {
  assert.equal(pairFeatures(amina, brian, 3).semantic_sim, 1)
  assert.equal(pairFeatures(amina, brian, -1).semantic_sim, 0)
  assert.equal(pairFeatures(amina, brian).semantic_sim, 0)
})

test('training and serving agree: Node reproduces scikit-learn probabilities', () => {
  assert.ok(validModel(fixture.model))
  fixture.rows.forEach((r, i) => assert.ok(Math.abs(predict(fixture.model, r.features) - fixture.expected[i]) < 1e-9, `row ${i}`))
})

test('model validation rejects unusable files', () => {
  const m = fixture.model
  assert.equal(validModel(null), false)
  assert.equal(validModel({ ...m, type: 'tree' }), false)
  assert.equal(validModel({ ...m, intercept: NaN }), false)
  assert.equal(validModel({ ...m, features: [...m.features, 'favourite_colour'] }), false)
  assert.equal(validModel({ ...m, coefficients: { ...m.coefficients, semantic_sim: undefined } }), false)
})

test('loadModel: missing file gives null, valid file loads, MATCH_MODEL=off disables it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'model-'))
  assert.equal(loadModel(join(dir, 'nope.json')), null)
  const p = join(dir, 'weights.json'); writeFileSync(p, JSON.stringify(fixture.model))
  assert.ok(loadModel(p))
  writeFileSync(join(dir, 'bad.json'), '{"type":"logistic"}'); assert.equal(loadModel(join(dir, 'bad.json')), null)
  process.env.MATCH_MODEL = 'off'; assert.equal(loadModel(p), null); delete process.env.MATCH_MODEL
})

test('lexical text similarity ranks related goals above unrelated ones', async () => {
  const e = (t) => lexicalEmbedder.embed(t)
  const student = await e('I want guidance on machine learning and data science careers')
  const related = await e('I lead machine learning teams and coach students on data science careers')
  const unrelated = await e('I run marketing campaigns and brand design for retail companies')
  assert.ok(cosine(student, related) > cosine(student, unrelated) + 0.2)
  assert.ok(Math.abs(cosine(student, student) - 1) < 1e-9)
  assert.equal(student.length, 256)
})

test('empty text gives zero similarity, not an error', async () => {
  assert.equal(cosine(await lexicalEmbedder.embed(''), await lexicalEmbedder.embed('machine learning')), 0)
  assert.equal(cosine(null, [1]), 0)
})
