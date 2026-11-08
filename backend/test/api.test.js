// Integration tests against a real PostgreSQL database. Clerk is replaced by a stand-in identity (headers),
// so the business rules, role checks and data rules are tested without Clerk keys. The stand-in exists only here.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { pool, q } from '../src/db.js'
import { lexicalEmbedder } from '../src/embeddings.js'
import { FEATURES } from '../src/hybrid.js'
import { semanticOn } from '../src/matching.js'
import { readFileSync } from 'node:fs'

const identity = async (req) => {
  const clerkId = req.headers['x-test-clerk-id']
  if (!clerkId) return null
  return { clerkId, getEmail: async () => req.headers['x-test-email'], getName: async () => 'Test Person' }
}
const deleted = []
let server, BASE
const stamp = Date.now()
const DEMO = [['student@demo.com', 'test_student'], ['alumni@demo.com', 'test_brian'], ['grace@demo.com', 'test_grace'], ['admin@demo.com', 'test_admin']]

before(async () => {
  for (const [email, cid] of DEMO) await q('UPDATE users SET clerk_user_id = $1 WHERE email = $2', [cid, email])
  server = createApp({ identity, deleteIdentity: async (id) => { deleted.push(id) } }).listen(0)
  BASE = `http://localhost:${server.address().port}/api`
})
after(async () => {   // remove everything the tests created and unlink the demo accounts
  await q("DELETE FROM forum_posts WHERE title LIKE 'Test post %'")
  await q("DELETE FROM updates WHERE title LIKE 'Strathmore only %'")
  await q("DELETE FROM users WHERE email LIKE '%@test.com'")
  await q("DELETE FROM universities WHERE name LIKE 'Test University %'")
  await q("DELETE FROM skills WHERE name LIKE 'Test skill %'")
  await q("DELETE FROM fields_of_study WHERE name LIKE 'Test field %'")
  await q("UPDATE users SET clerk_user_id = NULL WHERE clerk_user_id LIKE 'test_%'")
  await new Promise((r) => server.close(r)); await pool.end()
})

const call = async (path, { method = 'GET', as, body, base = BASE } = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(as && { 'x-test-clerk-id': as.id, 'x-test-email': as.email || '' }) }
  const r = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
const as = (id, email) => ({ id, email })
const student = as('test_student'), brian = as('test_brian'), grace = as('test_grace'), admin = as('test_admin')
let n = 0
const fresh = () => as(`test_new_${stamp}_${n}`, `t${stamp}x${n++}@test.com`)
const Y = new Date().getFullYear()
const profile = (extra = {}) => ({ name: 'Test Student', university: `Test University ${stamp}`, fieldOfStudy: 'Law', gradYear: Y + 1, ...extra })

test('TC-004 identity: signed out is rejected, known account loads, new account has no profile yet', async () => {
  assert.equal((await call('/me')).status, 401)
  const me = await call('/me', { as: student }); assert.equal(me.status, 200); assert.equal(me.data.role, 'student')
  const nobody = await call('/me', { as: fresh() }); assert.equal(nobody.status, 404); assert.equal(nobody.data.code, 'NO_PROFILE')
})

test('TC-001 profile with a new university; TC-002 second profile or reused email rejected', async () => {
  const who = fresh(); const body = profile()
  const r = await call('/profile', { method: 'POST', as: who, body })
  assert.equal(r.status, 201); assert.equal(r.data.university, body.university); assert.equal(r.data.email, who.email)
  assert.ok((await call('/universities')).data.includes(body.university))
  assert.equal((await call('/profile', { method: 'POST', as: who, body })).status, 409)
  const other = as(`test_new_${stamp}_dup`, who.email)
  assert.equal((await call('/profile', { method: 'POST', as: other, body })).status, 409)
})

test('TC-003 validation: missing field, university or graduation year, over-long skill name, no email', async () => {
  for (const extra of [{ fieldOfStudy: '' }, { university: '' }, { gradYear: '' }, { gradYear: 1900 }, { skills: ['x'.repeat(41)] }]) {
    assert.equal((await call('/profile', { method: 'POST', as: fresh(), body: profile(extra) })).status, 400, JSON.stringify(extra))
  }
  assert.equal((await call('/profile', { method: 'POST', as: as(`test_new_${stamp}_noemail`, ''), body: profile() })).status, 400)
})

test('TC-005 access control: signed out, no profile, wrong role', async () => {
  assert.equal((await call('/alumni')).status, 401)
  assert.equal((await call('/alumni', { as: fresh() })).status, 403)
  assert.equal((await call('/updates', { method: 'POST', as: student, body: { title: 't', body: 'b' } })).status, 403)
  assert.equal((await call('/admin/users', { as: student })).status, 403)
})

test('TC-005b administrator is created only for an email listed in ADMIN_EMAILS', async () => {
  const listed = fresh(); process.env.ADMIN_EMAILS = `${listed.email}, someone@else.com`
  const r = await call('/me', { as: listed }); assert.equal(r.status, 200); assert.equal(r.data.role, 'admin')
  assert.equal((await call('/me', { as: fresh() })).status, 404)
  delete process.env.ADMIN_EMAILS
})

test('TC-006 directory filters and search', async () => {
  const f = await call('/alumni?university=Makerere%20University&industry=Technology', { as: student })
  assert.deepEqual(f.data.map((a) => a.name), ['Daniel Kato'])
  assert.deepEqual((await call('/alumni?q=react', { as: student })).data.map((a) => a.name), ['Sarah Njeri'])
})

test('TC-007 matching through the API: 85, 60, 30, 17; zero scores excluded', async () => {
  const m = await call('/matches', { as: student })
  assert.deepEqual(m.data.map((x) => [x.mentor.name, x.score]), [['Brian Otieno', 85], ['Daniel Kato', 60], ['Sarah Njeri', 30], ['Grace Mutua', 17]])
  assert.ok(m.data.every((x) => x.reasons.length > 0))
})

test('TC-008 student with no matching attributes gets an empty list, not an error', async () => {
  // A field of study only this test uses, so no real or demo account can share it and produce a match.
  const field = `Test field ${stamp}`
  await q('INSERT INTO fields_of_study (name) VALUES ($1)', [field])
  const who = fresh(); await call('/profile', { method: 'POST', as: who, body: profile({ fieldOfStudy: field }) })
  const m = await call('/matches', { as: who }); assert.equal(m.status, 200); assert.deepEqual(m.data, [])
})

test('TC-009 duplicate request stored once; TC-010 only the addressed mentor can answer', async () => {
  const who = fresh(); const created = (await call('/profile', { method: 'POST', as: who, body: profile() })).data
  const b = (await call('/alumni?q=Brian', { as: who })).data[0]
  assert.equal((await call('/requests', { method: 'POST', as: who, body: { mentorId: b.id } })).status, 201)
  await call('/requests', { method: 'POST', as: who, body: { mentorId: b.id } })
  assert.equal((await call('/requests/sent', { as: who })).data.filter((r) => r.toId === b.id).length, 1)
  const incoming = (await call('/requests/incoming', { as: brian })).data.find((r) => r.from.id === created.id)
  assert.ok(incoming); assert.equal(incoming.status, 'pending')
  assert.equal((await call(`/requests/${incoming.id}`, { method: 'PATCH', as: grace, body: { status: 'accepted' } })).status, 403)
  assert.equal((await call(`/requests/${incoming.id}`, { method: 'PATCH', as: brian, body: { status: 'accepted' } })).status, 200)
  assert.equal((await call('/requests/sent', { as: who })).data.find((r) => r.toId === b.id).status, 'accepted')
  assert.equal((await call('/requests', { method: 'POST', as: who, body: { mentorId: created.id } })).status, 404)
})

test('TC-011 forum: empty rejected, post, reply, category filter', async () => {
  assert.equal((await call('/posts', { method: 'POST', as: student, body: { title: '  ', body: 'x', category: 'General' } })).status, 400)
  assert.equal((await call('/posts', { method: 'POST', as: student, body: { title: 't', body: 'x', category: 'Gossip' } })).status, 400)
  const title = `Test post ${stamp}`
  const p = await call('/posts', { method: 'POST', as: student, body: { title, body: 'hello', category: 'General' } })
  assert.equal(p.status, 201)
  assert.equal((await call(`/posts/${p.data.id}/replies`, { method: 'POST', as: student, body: { body: 'a reply' } })).status, 201)
  const list = (await call('/posts', { as: student })).data
  assert.equal(list[0].title, title); assert.equal(list[0].replies.length, 1)
  assert.ok((await call('/posts?category=General', { as: student })).data.every((x) => x.category === 'General'))
})

test('TC-012 updates audience by university', async () => {
  const title = `Strathmore only ${stamp}`
  assert.equal((await call('/updates', { method: 'POST', as: admin, body: { title, body: 'x', university: 'Strathmore University' } })).status, 201)
  const has = async (u) => (await call(`/updates?university=${encodeURIComponent(u)}`, { as: admin })).data.some((x) => x.title === title)
  assert.equal(await has('Strathmore University'), true)
  assert.equal(await has('Kenyatta University'), false)
})

test('TC-014 security: no credentials in responses, no email shown to other users', async () => {
  const me = (await call('/me', { as: student })).data
  assert.ok(!('password' in me) && !('password_hash' in me) && !('clerk_user_id' in me))
  assert.ok((await call('/alumni', { as: student })).data.every((a) => !('email' in a)))
})

test('Admin summary and users list work for admin', async () => {
  const s = await call('/admin/summary', { as: admin })
  assert.equal(s.status, 200); assert.ok(s.data.students >= 1)
  assert.ok((await call('/admin/users', { as: admin })).data.length >= 9)
})

test('TC-015 admin sees every user with full details; others cannot', async () => {
  const list = await call('/admin/users', { as: admin })
  assert.equal(list.status, 200); assert.ok(list.data.length >= 9)
  assert.ok(list.data.every((u) => 'email' in u && 'role' in u && 'university' in u && 'createdAt' in u))
  assert.equal((await call('/admin/users', { as: student })).status, 403)
})

test('TC-016 admin edits a user: role, mentor flag, profile; invalid values rejected', async () => {
  const who = fresh(); const created = (await call('/profile', { method: 'POST', as: who, body: profile() })).data
  const put = (body, by = admin, id = created.id) => call(`/admin/users/${id}`, { method: 'PUT', as: by, body })
  let r = await put({ role: 'alumnus', jobTitle: 'Advocate', company: 'Test Chambers', mentor: true, fieldOfStudy: 'Law' })
  assert.equal(r.status, 200); assert.equal(r.data.role, 'alumnus'); assert.equal(r.data.mentor, true); assert.equal(r.data.jobTitle, 'Advocate')
  assert.equal((await call('/me', { as: who })).data.role, 'alumnus')
  r = await put({ role: 'student' }); assert.equal(r.data.role, 'student'); assert.equal(r.data.mentor, false)
  assert.equal((await put({ role: 'teacher' })).status, 400)
  assert.equal((await put({ skills: ['x'.repeat(41)] })).status, 400)
  assert.equal((await put({ role: 'admin' }, student)).status, 403)
  assert.equal((await put({ name: 'x' }, admin, 999999)).status, 404)
})

test('TC-017 admin cannot demote or delete themselves', async () => {
  const me = (await call('/me', { as: admin })).data
  assert.equal((await call(`/admin/users/${me.id}`, { method: 'PUT', as: admin, body: { role: 'student' } })).status, 400)
  assert.equal((await call(`/admin/users/${me.id}`, { method: 'DELETE', as: admin })).status, 400)
})

test('TC-018 admin deletes a user: profile removed, sign-in account removed, their posts cascade', async () => {
  const who = fresh(); const created = (await call('/profile', { method: 'POST', as: who, body: profile() })).data
  const post = await call('/posts', { method: 'POST', as: who, body: { title: `Test post ${stamp} del`, body: 'x', category: 'General' } })
  assert.equal((await call(`/admin/users/${created.id}`, { method: 'DELETE', as: student })).status, 403)
  assert.equal((await call(`/admin/users/${created.id}`, { method: 'DELETE', as: admin })).status, 200)
  assert.ok(deleted.includes(who.id))
  assert.equal((await call('/me', { as: who })).status, 404)
  assert.ok(!(await call('/posts', { as: admin })).data.some((p) => p.id === post.data.id))
})

test('TC-019 role is inferred from graduation year; a role sent by the client is ignored', async () => {
  const s = (await call('/profile', { method: 'POST', as: fresh(), body: profile({ gradYear: Y + 1 }) })).data
  assert.equal(s.role, 'student'); assert.equal(s.mentor, false)
  const a = (await call('/profile', { method: 'POST', as: fresh(), body: profile({ gradYear: Y - 3, mentor: true, jobTitle: 'Advocate' }) })).data
  assert.equal(a.role, 'alumnus'); assert.equal(a.mentor, true)
  const sneaky = (await call('/profile', { method: 'POST', as: fresh(), body: profile({ gradYear: Y + 1, role: 'admin', mentor: true }) })).data
  assert.equal(sneaky.role, 'student'); assert.equal(sneaky.mentor, false)
  assert.equal((await call('/profile', { method: 'POST', as: fresh(), body: profile({ gradYear: Y }) })).data.role, 'student')
})

test('TC-020 changing graduation year in the profile changes the role; mentor flag follows', async () => {
  const who = fresh(); await call('/profile', { method: 'POST', as: who, body: profile({ gradYear: Y + 1 }) })
  let r = await call('/me', { method: 'PUT', as: who, body: { gradYear: Y - 1, mentor: true } })
  assert.equal(r.data.role, 'alumnus'); assert.equal(r.data.mentor, true)
  r = await call('/me', { method: 'PUT', as: who, body: { gradYear: Y + 2 } })
  assert.equal(r.data.role, 'student'); assert.equal(r.data.mentor, false)
  assert.equal((await call('/me', { method: 'PUT', as: who, body: { gradYear: 1900 } })).status, 400)
})

test('TC-021 a student whose graduation year has passed becomes an alumnus automatically', async () => {
  const who = fresh(); const created = (await call('/profile', { method: 'POST', as: who, body: profile({ gradYear: Y + 1 }) })).data
  await q('UPDATE users SET grad_year = $1 WHERE id = $2', [Y - 1, created.id])
  assert.equal((await call('/matches', { as: who })).status, 403)   // now an alumnus: student-only route refused
  assert.equal((await call('/me', { as: who })).data.role, 'alumnus')
})

test('TC-022 tester ratings: stored once per pair, no scores or emails shown, only students may rate', async () => {
  const who = fresh(); await call('/profile', { method: 'POST', as: who, body: profile() })
  const list = (await call('/rate/candidates', { as: who })).data
  assert.ok(list.length >= 1 && list.every((m) => m.rating === null && !('email' in m) && !('score' in m)))
  const b = list.find((m) => m.name === 'Brian Otieno')
  assert.equal((await call('/rate', { method: 'POST', as: who, body: { mentorId: b.id, helpful: true } })).status, 201)
  assert.equal((await call('/rate', { method: 'POST', as: who, body: { mentorId: b.id, helpful: false } })).status, 201)
  assert.equal((await call('/rate/candidates', { as: who })).data.find((m) => m.id === b.id).rating, false)
  const rows = await q('SELECT helpful FROM match_feedback WHERE mentor_id = $1 AND student_id = (SELECT id FROM users WHERE email = $2)', [b.id, who.email])
  assert.equal(rows.length, 1)
  assert.equal((await call('/rate', { method: 'POST', as: who, body: { mentorId: b.id, helpful: 'yes' } })).status, 400)
  assert.equal((await call('/rate', { method: 'POST', as: who, body: { mentorId: 999999, helpful: true } })).status, 404)
  assert.equal((await call('/rate', { method: 'POST', as: brian, body: { mentorId: b.id, helpful: true } })).status, 403)
})

test('TC-023 training export: admin only, numbers only, one row per rating', async () => {
  const raw = async (as) => { const r = await fetch(BASE + '/admin/export/feedback.csv', { headers: { 'x-test-clerk-id': as.id, 'x-test-email': '' } }); return { status: r.status, type: r.headers.get('content-type'), text: await r.text() } }
  assert.equal((await raw(student)).status, 403)
  const r = await raw(admin)
  assert.equal(r.status, 200); assert.match(r.type, /text\/csv/)
  const lines = r.text.trim().split('\n')
  assert.equal(lines[0], ['student_id', 'mentor_id', 'helpful', 'rule_score', ...FEATURES, 'sim_provider', 'created_at'].join(','))
  assert.equal(lines.length - 1, (await q('SELECT count(*)::int AS n FROM match_feedback'))[0].n)
  assert.ok(!r.text.includes('@') && !r.text.includes('Brian'))
})

const bios = { student: 'I want guidance on machine learning and data science careers', related: 'I lead machine learning teams and coach students on data science careers', unrelated: 'I run marketing campaigns and brand design for retail companies' }
async function hybridSetup() {
  const s = fresh(), m1 = fresh(), m2 = fresh()
  const base = { university: `Test University ${stamp}`, fieldOfStudy: 'Computer Science' }
  await call('/profile', { method: 'POST', as: s, body: { ...base, name: 'Test Seeker', gradYear: Y + 1, skills: ['Python'], interests: ['Technical skills'], bio: bios.student } })
  const a = (await call('/profile', { method: 'POST', as: m1, body: { ...base, name: 'Test Mentor One', gradYear: Y - 5, mentor: true, skills: ['Python'], interests: ['Technical skills'], bio: bios.unrelated } })).data
  const b = (await call('/profile', { method: 'POST', as: m2, body: { ...base, name: 'Test Mentor Two', gradYear: Y - 5, mentor: true, bio: bios.related } })).data
  return { s, a, b }
}
const pos = (list, name) => list.findIndex((x) => x.mentor.name === name)
const strongSimilarity = { type: 'logistic', features: FEATURES, intercept: -3, coefficients: { field_match: 0.5, skills_shared: 0.2, interests_shared: 0.2, industry_match: 0, availability_match: 0, same_university: 0, semantic_sim: 8 } }

test('TC-024 hybrid model: learned weights and text similarity change the ranking; rules stay the default', async () => {
  const { s, a, b } = await hybridSetup()
  const rules = (await call('/matches', { as: s })).data
  assert.ok(rules.every((x) => x.method === 'rules'))
  assert.ok(pos(rules, 'Test Mentor One') < pos(rules, 'Test Mentor Two'))   // rules prefer the closer skill match
  const app2 = createApp({ identity, embedder: lexicalEmbedder, model: strongSimilarity }).listen(0)
  try {
    const base = `http://localhost:${app2.address().port}/api`
    const hyb = (await call('/matches', { as: s, base })).data
    assert.ok(hyb.every((x) => x.method === 'hybrid-learned' && x.score >= 0 && x.score <= 100 && Number.isInteger(x.score)))
    assert.ok(pos(hyb, 'Test Mentor Two') < pos(hyb, 'Test Mentor One'))      // similar goals now win
    const two = hyb.find((x) => x.mentor.name === 'Test Mentor Two')
    assert.ok(two.similarity > 0.3 && two.ruleScore === rules.find((x) => x.mentor.name === 'Test Mentor Two').ruleScore)
    assert.ok(two.reasons.some((r) => r.includes('similar goals')))
    assert.ok((await q('SELECT count(*)::int AS n FROM profile_embeddings WHERE user_id = ANY($1)', [[a.id, b.id]]))[0].n === 2)   // embeddings cached
  } finally { await new Promise((r) => app2.close(r)) }
})

test('TC-025 text similarity is ignored if it came from a different provider than the model was trained with', async () => {
  const { s } = await hybridSetup()
  const app3 = createApp({ identity, embedder: lexicalEmbedder, model: { ...strongSimilarity, embedding_provider: 'minilm-l6-v2' } }).listen(0)
  try {
    const hyb = (await call('/matches', { as: s, base: `http://localhost:${app3.address().port}/api` })).data
    const two = hyb.find((x) => x.mentor.name === 'Test Mentor Two')
    assert.equal(two.similarity, 0)
    assert.ok(pos(hyb, 'Test Mentor One') < pos(hyb, 'Test Mentor Two'))
  } finally { await new Promise((r) => app3.close(r)) }
})

test('TC-026 typed-in skills: a new skill is added once, a listed one is reused ignoring case', async () => {
  const custom = `Test skill ${stamp}`
  const a = await call('/profile', { method: 'POST', as: fresh(), body: profile({ skills: [custom, 'python', '  Python  '] }) })
  assert.equal(a.status, 201); assert.deepEqual(a.data.skills, ['Python', custom].sort())
  const b = await call('/profile', { method: 'POST', as: fresh(), body: profile({ skills: [custom.toUpperCase()] }) })
  assert.deepEqual(b.data.skills, [custom])
  assert.equal((await q('SELECT count(*)::int AS n FROM skills WHERE lower(name) = lower($1)', [custom]))[0].n, 1)
  assert.equal((await call('/profile', { method: 'POST', as: fresh(), body: profile({ skills: Array.from({ length: 31 }, (_, i) => `Test skill ${stamp} ${i}`) }) })).status, 400)
})

// ---------- CV suggestions ----------
const fixture = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url))
const upload = async (who, buf, name) => {
  const form = new FormData()
  if (buf) form.append('cv', new Blob([buf]), name)
  const headers = who ? { 'x-test-clerk-id': who.id, 'x-test-email': who.email || '' } : {}
  const r = await fetch(`${BASE}/profile/parse-cv`, { method: 'POST', headers, body: form })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
// A fingerprint of every table, to prove the endpoint writes nothing.
const snapshot = async () => {
  const tables = (await q("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename")).map((t) => t.tablename)
  const out = {}
  for (const t of tables) out[t] = (await q(`SELECT md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM ${t} x`))[0].h
  return out
}
const UNREADABLE = "We couldn't read text from this file; please fill in manually."

test('TC-027 CV (Word): suggests university from a short form, field, course, year, skills, job and bio', async () => {
  const r = await upload(fresh(), fixture('cv_law.docx'), 'cv_law.docx')   // someone still completing their profile
  assert.equal(r.status, 200)
  const s = r.data.suggestions
  assert.equal(s.university, 'University of Nairobi'); assert.equal(s.fieldOfStudy, 'Law'); assert.equal(s.course, 'Bachelor of Laws (LLB)')
  assert.equal(s.gradYear, 2021); assert.equal(s.industry, 'Legal Services')
  assert.equal(s.jobTitle, 'Associate Advocate'); assert.equal(s.company, 'Mwangi & Co Advocates')
  for (const k of ['Legal research', 'Contract drafting', 'Negotiation', 'Public speaking', 'Excel']) assert.ok(s.skills.includes(k), k)
  assert.ok(!s.skills.includes('Python'))
  assert.match(s.bio, /^Commercial lawyer .* mentoring law students\.$/)
  assert.ok(!('role' in s))   // the role still comes from the graduation year
})

test('TC-028 CV (PDF): full JKUAT name, expected graduation year and nursing degree are recognised', async () => {
  const r = await upload(student, fixture('cv_nursing.pdf'), 'cv_nursing.pdf')
  assert.equal(r.status, 200)
  const s = r.data.suggestions
  assert.equal(s.university, 'JKUAT'); assert.equal(s.fieldOfStudy, 'Nursing'); assert.equal(s.course, 'BSc Nursing'); assert.equal(s.gradYear, 2027)
  assert.deepEqual(s.skills.filter((k) => ['Python', 'Clinical skills', 'Communication', 'Teamwork'].includes(k)).sort(), ['Clinical skills', 'Communication', 'Python', 'Teamwork'])
})

test('TC-029 CV errors: scanned or broken files, wrong types, files over 5 MB and missing files get clear messages', async () => {
  const who = fresh()
  let r = await upload(who, fixture('cv_scanned.pdf'), 'scan.pdf'); assert.equal(r.status, 422); assert.equal(r.data.error, UNREADABLE)
  r = await upload(who, Buffer.from('%PDF-1.4 this is not really a pdf'), 'broken.pdf'); assert.equal(r.status, 422); assert.equal(r.data.error, UNREADABLE)
  r = await upload(who, Buffer.from('plain text pretending to be a pdf'), 'renamed.pdf'); assert.equal(r.status, 422)
  r = await upload(who, Buffer.from('PK\x03\x04 not a word file'), 'broken.docx'); assert.equal(r.status, 422)
  r = await upload(who, Buffer.from('My CV'), 'cv.txt'); assert.equal(r.status, 415); assert.match(r.data.error, /PDF or Word/)
  r = await upload(who, Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024)]), 'big.pdf'); assert.equal(r.status, 413); assert.match(r.data.error, /5 MB/)
  r = await upload(who, null); assert.equal(r.status, 400)
})

test('TC-030 reading a CV writes nothing to the database', async () => {
  const before = await snapshot()
  const who = fresh()
  for (const [f, name] of [['cv_law.docx', 'a.docx'], ['cv_nursing.pdf', 'b.pdf'], ['cv_scanned.pdf', 'c.pdf']]) await upload(who, fixture(f), name)
  await upload(student, fixture('cv_nursing.pdf'), 'b.pdf')
  assert.deepEqual(await snapshot(), before)
  assert.equal((await call('/me', { as: who })).status, 404)   // no profile was created
})

test('TC-031 CV reading requires sign-in', async () => {
  const r = await upload(null, fixture('cv_law.docx'), 'cv_law.docx')
  assert.equal(r.status, 401); assert.ok(!r.data.suggestions)
})

// ---------- rules + text meaning (no learned model) ----------
const withApp = async (opts, fn) => {
  const srv = createApp({ identity, embedder: lexicalEmbedder, ...opts }).listen(0)
  try { return await fn(`http://localhost:${srv.address().port}/api`) } finally { await new Promise((r) => srv.close(r)) }
}
const bonusOf = (x) => x.score - x.ruleScore
const MEANING_REASON = /^Similar goals in their bios \(\d{1,3}% similar\)$/

test('TC-032 rules + meaning: related bios give a bigger bonus than unrelated bios', async () => {
  const { s } = await hybridSetup()
  const list = await withApp({ semantic: true }, async (base) => (await call('/matches', { as: s, base })).data)
  const one = list.find((x) => x.mentor.name === 'Test Mentor One'); const two = list.find((x) => x.mentor.name === 'Test Mentor Two')
  assert.equal(two.method, 'rules+meaning'); assert.ok(bonusOf(two) > 0); assert.ok(two.reasons.some((r) => MEANING_REASON.test(r)))
  assert.equal(two.similarity, Math.round(two.similarity * 100) / 100)
  assert.equal(bonusOf(one), 0); assert.equal(one.method, 'rules')   // unrelated bio: no bonus, plain rules
  assert.ok(bonusOf(two) > bonusOf(one))
})

test('TC-033 rules + meaning: a student with no bio gets no bonus and exactly the rules list', async () => {
  const who = fresh()
  await call('/profile', { method: 'POST', as: who, body: profile({ fieldOfStudy: 'Computer Science', skills: ['Python'], interests: ['Technical skills'] }) })
  const rules = (await call('/matches', { as: who })).data
  const meaning = await withApp({ semantic: true }, async (base) => (await call('/matches', { as: who, base })).data)
  assert.ok(rules.length > 0); assert.deepEqual(meaning, rules)
})

test('TC-034 rules + meaning: the final score is capped at 100', async () => {
  const s = fresh(), m = fresh()
  const same = { university: `Test University ${stamp}`, fieldOfStudy: 'Computer Science', industry: 'Technology', skills: ['Python', 'SQL', 'React', 'JavaScript'],
    interests: ['Career guidance', 'Networking', 'Technical skills'], bio: bios.student }   // rules: 30 + 25 + 25 + 10 + 5 = 95, no availability
  await call('/profile', { method: 'POST', as: s, body: { ...same, name: 'Test Capped Student', gradYear: Y + 1 } })
  await call('/profile', { method: 'POST', as: m, body: { ...same, name: 'Test Capped Mentor', gradYear: Y - 5, mentor: true } })
  const x = await withApp({ semantic: true }, async (base) => (await call('/matches', { as: s, base })).data.find((y) => y.mentor.name === 'Test Capped Mentor'))
  assert.equal(x.ruleScore, 95); assert.equal(x.similarity, 1); assert.equal(x.score, 100)   // 95 + 15 would be 110
})

test('TC-035 rules + meaning: a mentor from another field with a rule score of 0 appears because their goals match', async () => {
  const field = `Test field ${stamp} meaning`
  await q('INSERT INTO fields_of_study (name) VALUES ($1)', [field])
  const s = fresh(), m = fresh()
  await call('/profile', { method: 'POST', as: s, body: profile({ name: 'Test Policy Student', university: `Test University ${stamp} A`, fieldOfStudy: field,
    bio: 'I want to move into climate policy work, advising county governments on water conservation and drought planning.' }) })
  await call('/profile', { method: 'POST', as: m, body: profile({ name: 'Test Bridge Mentor', university: `Test University ${stamp} B`, fieldOfStudy: 'Nursing', gradYear: Y - 5, mentor: true,
    bio: 'I advise county governments on climate policy, water conservation and drought planning, and mentor people moving into policy work.' }) })
  assert.ok(!(await call('/matches', { as: s })).data.some((x) => x.mentor.name === 'Test Bridge Mentor'))   // rules alone: score 0, left out
  const x = await withApp({ semantic: true }, async (base) => (await call('/matches', { as: s, base })).data.find((y) => y.mentor.name === 'Test Bridge Mentor'))
  assert.ok(x); assert.equal(x.ruleScore, 0); assert.ok(x.score > 0); assert.equal(x.method, 'rules+meaning')
  assert.deepEqual(x.reasons.filter((r) => MEANING_REASON.test(r)).length, 1)
})

test('TC-036 a loaded learned model takes precedence over rules + meaning', async () => {
  const { s } = await hybridSetup()
  const learned = await withApp({ model: strongSimilarity }, async (base) => (await call('/matches', { as: s, base })).data)
  const both = await withApp({ model: strongSimilarity, semantic: true }, async (base) => (await call('/matches', { as: s, base })).data)
  assert.ok(both.length > 0 && both.every((x) => x.method === 'hybrid-learned'))
  assert.ok(!both.some((x) => x.reasons.some((r) => MEANING_REASON.test(r))))
  assert.deepEqual(both, learned)   // exactly as before
})

test('TC-037 MATCH_SEMANTIC=off gives exactly the old rules behaviour', async () => {
  const { s } = await hybridSetup()
  const old = (await call('/matches', { as: s })).data                       // default app: semantic off
  const off = await withApp({ semantic: semanticOn({ MATCH_SEMANTIC: 'off' }) }, async (base) => (await call('/matches', { as: s, base })).data)
  const on = await withApp({ semantic: semanticOn({}) }, async (base) => (await call('/matches', { as: s, base })).data)
  assert.deepEqual(off, old); assert.ok(off.every((x) => x.method === 'rules' && !('similarity' in x)))
  assert.ok(on.some((x) => x.method === 'rules+meaning'))   // and switching it on does change things
})

// ---------- after acceptance: mentorships, chat, sessions, reviews, unread counts ----------
const newMentor = async (name = 'Test Flow Mentor') => {
  const who = fresh()
  const p = (await call('/profile', { method: 'POST', as: who, body: profile({ name, gradYear: Y - 5, mentor: true }) })).data
  return { who, p }
}
const newStudent = async (name = 'Test Flow Student') => {
  const who = fresh()
  return { who, p: (await call('/profile', { method: 'POST', as: who, body: profile({ name }) })).data }
}
const requestAndAnswer = async (student, mentor, status = 'accepted') => {
  await call('/requests', { method: 'POST', as: student.who, body: { mentorId: mentor.p.id } })
  const reqId = (await call('/requests/incoming', { as: mentor.who })).data.find((r) => r.from.id === student.p.id).id
  return { reqId, ...(await call(`/requests/${reqId}`, { method: 'PATCH', as: mentor.who, body: { status } })) }
}
const pair = async () => {
  const mentor = await newMentor(), student = await newStudent()
  const r = await requestAndAnswer(student, mentor)
  return { mentor, student, id: r.data.mentorshipId }
}
const soon = (days = 1) => new Date(Date.now() + days * 86400000).toISOString()
const send = (as, id, body) => call(`/mentorships/${id}/messages`, { method: 'POST', as, body: { body } })
const unread = async (as) => (await call('/notifications', { as })).data

test('TC-038 accepting creates one active mentorship, kept when matches refresh; a mentor can have at most 5 active mentees', async () => {
  const mentor = await newMentor(); const students = []
  for (let i = 0; i < 6; i++) students.push(await newStudent(`Test Flow Student ${i}`))
  const first = await requestAndAnswer(students[0], mentor)
  assert.equal(first.status, 200); assert.ok(Number.isInteger(first.data.mentorshipId))
  const again = await call(`/requests/${first.reqId}`, { method: 'PATCH', as: mentor.who, body: { status: 'accepted' } })
  assert.equal(again.data.mentorshipId, first.data.mentorshipId)   // reused, not duplicated
  assert.equal((await call(`/requests/${first.reqId}`, { method: 'PATCH', as: mentor.who, body: { status: 'declined' } })).status, 409)
  await call('/matches', { as: students[0].who })                   // refreshing cached scores must not delete the mentorship
  const rows = await q('SELECT status FROM mentorship_matches WHERE student_id = $1 AND mentor_id = $2', [students[0].p.id, mentor.p.id])
  assert.deepEqual(rows.map((r) => r.status), ['active'])
  const list = (await call('/mentorships', { as: students[0].who })).data
  assert.equal(list.length, 1); assert.equal(list[0].status, 'active'); assert.equal(list[0].other.name, 'Test Flow Mentor'); assert.equal(list[0].myRole, 'student')
  for (let i = 1; i < 5; i++) assert.equal((await requestAndAnswer(students[i], mentor)).status, 200)
  const sixth = await requestAndAnswer(students[5], mentor)
  assert.equal(sixth.status, 409); assert.match(sixth.data.error, /5 active mentees/)
  assert.equal((await call('/requests/sent', { as: students[5].who })).data.find((r) => r.toId === mentor.p.id).status, 'pending')
  assert.equal((await call('/mentorships', { as: mentor.who })).data.filter((m) => m.status === 'active').length, 5)
})

test('TC-039 only the two participants can read or send messages; the admin and strangers cannot; no emails shown', async () => {
  const { mentor, student, id } = await pair()
  const stranger = await newStudent('Test Flow Stranger')
  assert.equal((await send(student.who, id, 'Hello, thank you for accepting!')).status, 201)
  assert.equal((await send(mentor.who, id, 'Happy to help.')).status, 201)
  const thread = (await call(`/mentorships/${id}/messages`, { as: mentor.who })).data
  assert.deepEqual(thread.map((x) => [x.body, x.mine]), [['Hello, thank you for accepting!', false], ['Happy to help.', true]])
  for (const who of [admin, stranger.who]) {
    for (const path of [`/mentorships/${id}/messages`, `/mentorships/${id}`]) assert.equal((await call(path, { as: who })).status, 403, path)
    assert.equal((await send(who, id, 'let me in')).status, 403)
  }
  assert.equal((await call('/mentorships/99999999/messages', { as: student.who })).status, 404)
  assert.equal((await call(`/mentorships/${id}/messages`)).status, 401)
  const detail = JSON.stringify((await call(`/mentorships/${id}`, { as: student.who })).data)
  assert.ok(!detail.includes(mentor.who.email) && !detail.includes('"email"'))
})

test('TC-040 messages: empty and over-long rejected, read-only after the mentorship ends', async () => {
  const { mentor, student, id } = await pair()
  assert.equal((await send(student.who, id, '   ')).status, 400)
  assert.equal((await send(student.who, id, 'x'.repeat(2001))).status, 400)
  assert.equal((await send(student.who, id, 'x'.repeat(2000))).status, 201)
  assert.equal((await call(`/mentorships/${id}/end`, { method: 'POST', as: mentor.who })).data.status, 'ended')
  const blocked = await send(student.who, id, 'one more thing'); assert.equal(blocked.status, 409); assert.match(blocked.data.error, /read-only/)
  assert.equal((await call(`/mentorships/${id}/messages`, { as: student.who })).data.length, 1)   // still readable
  assert.equal((await call(`/mentorships/${id}/end`, { method: 'POST', as: student.who })).status, 409)
})

test('TC-041 sessions: future date and topic required; only the other person confirms or declines; either can cancel', async () => {
  const { mentor, student, id } = await pair()
  const stranger = await newStudent('Test Flow Stranger')
  const propose = (as, body) => call(`/mentorships/${id}/sessions`, { method: 'POST', as, body })
  const answer = (as, sid, status) => call(`/mentorships/${id}/sessions/${sid}`, { method: 'PATCH', as, body: { status } })
  assert.equal((await propose(student.who, { startsAt: new Date(Date.now() - 60000).toISOString(), topic: 'CV review' })).status, 400)
  assert.equal((await propose(student.who, { startsAt: 'not a date', topic: 'CV review' })).status, 400)
  assert.equal((await propose(student.who, { startsAt: soon(), topic: 'x'.repeat(201) })).status, 400)
  assert.equal((await propose(stranger.who, { startsAt: soon(), topic: 'CV review' })).status, 403)
  const a = (await propose(student.who, { startsAt: soon(), topic: 'CV review' })).data
  assert.equal(a.status, 'proposed'); assert.equal(a.upcoming, true)
  assert.equal((await answer(student.who, a.id, 'confirmed')).status, 403)   // the proposer cannot confirm
  assert.equal((await answer(mentor.who, a.id, 'confirmed')).data.status, 'confirmed')
  assert.equal((await answer(mentor.who, a.id, 'declined')).status, 409)    // already confirmed
  assert.equal((await answer(student.who, a.id, 'cancelled')).data.status, 'cancelled')
  const b = (await propose(mentor.who, { startsAt: soon(2), topic: 'Interview practice' })).data
  assert.equal((await answer(mentor.who, b.id, 'declined')).status, 403)
  assert.equal((await answer(student.who, b.id, 'declined')).data.status, 'declined')
  assert.equal((await answer(student.who, b.id, 'maybe')).status, 400)
  const c = (await propose(mentor.who, { startsAt: soon(3), topic: 'Portfolio' })).data
  assert.equal((await answer(stranger.who, c.id, 'cancelled')).status, 403)
  await call(`/mentorships/${id}/end`, { method: 'POST', as: student.who })
  const after = (await call(`/mentorships/${id}/sessions`, { as: student.who })).data
  assert.equal(after.find((x) => x.id === c.id).status, 'cancelled')        // ending cancels sessions not yet held
  assert.equal((await propose(student.who, { startsAt: soon(), topic: 'Too late' })).status, 409)
})

test('TC-042 reviews: only the student, only after ending, only once, rating 1 to 5', async () => {
  const { mentor, student, id } = await pair()
  const review = (as, body) => call(`/mentorships/${id}/review`, { method: 'POST', as, body })
  assert.equal((await review(student.who, { rating: 5 })).status, 409)      // still active
  await call(`/mentorships/${id}/end`, { method: 'POST', as: mentor.who })
  assert.equal((await call('/mentorships', { as: student.who })).data.find((m) => m.id === id).canReview, true)
  assert.equal((await review(mentor.who, { rating: 5 })).status, 403)
  assert.equal((await review(admin, { rating: 5 })).status, 403)
  for (const rating of [0, 6, 2.5, 'five', null]) assert.equal((await review(student.who, { rating })).status, 400, String(rating))
  assert.equal((await review(student.who, { rating: 4, comment: 'x'.repeat(501) })).status, 400)
  assert.equal((await review(student.who, { rating: 4, comment: 'Very helpful.' })).status, 201)
  assert.equal((await review(student.who, { rating: 1 })).status, 409)
  const m = (await call('/mentorships', { as: student.who })).data.find((x) => x.id === id)
  assert.equal(m.reviewed, true); assert.equal(m.canReview, false)
})

test('TC-043 unread counts rise for new acceptances, messages and session proposals, and clear when read', async () => {
  const { mentor, student, id } = await pair()
  assert.deepEqual(await unread(student.who), { mentorships: 1, accepted: 1, messages: 0, sessions: 0, total: 1 })
  assert.equal((await unread(mentor.who)).total, 0)                        // the mentor accepted it, so it is not new to them
  await send(mentor.who, id, 'Welcome!'); await send(mentor.who, id, 'When are you free?')
  await call(`/mentorships/${id}/sessions`, { method: 'POST', as: mentor.who, body: { startsAt: soon(), topic: 'First chat' } })
  assert.deepEqual(await unread(student.who), { mentorships: 4, accepted: 1, messages: 2, sessions: 1, total: 4 })
  assert.equal((await unread(mentor.who)).total, 0)                        // your own messages are never unread
  assert.equal((await call('/mentorships', { as: student.who })).data.find((m) => m.id === id).unread.total, 4)
  await call(`/mentorships/${id}`, { as: student.who })                    // opening the mentorship reads everything
  assert.equal((await unread(student.who)).total, 0)
  await send(student.who, id, 'Thursday works')
  assert.equal((await unread(mentor.who)).messages, 1)
  await call(`/mentorships/${id}/messages`, { as: mentor.who })
  assert.equal((await unread(mentor.who)).messages, 0)
})

test('TC-044 admin summary shows mentorship counts and average rating, never message text', async () => {
  const { student, id } = await pair()
  const secret = `Private note ${stamp}`
  await send(student.who, id, secret)
  const s = await call('/admin/summary', { as: admin })
  assert.equal(s.status, 200)
  for (const k of ['activeMentorships', 'sessions', 'reviews']) assert.ok(Number.isInteger(s.data[k]), k)
  assert.ok(s.data.averageRating === null || (s.data.averageRating >= 1 && s.data.averageRating <= 5))
  assert.ok(s.data.activeMentorships >= 1)
  assert.ok(!JSON.stringify(s.data).includes(secret) && !JSON.stringify((await call('/admin/users', { as: admin })).data).includes(secret))
  assert.equal((await call('/admin/summary', { as: student.who })).status, 403)
})
