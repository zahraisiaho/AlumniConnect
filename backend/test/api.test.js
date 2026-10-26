// Integration tests against a real PostgreSQL database. Clerk is replaced by a stand-in identity (headers),
// so the business rules, role checks and data rules are tested without Clerk keys. The stand-in exists only here.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.js'
import { pool, q } from '../src/db.js'

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
  await q("UPDATE users SET clerk_user_id = NULL WHERE clerk_user_id LIKE 'test_%'")
  await new Promise((r) => server.close(r)); await pool.end()
})

const call = async (path, { method = 'GET', as, body } = {}) => {
  const headers = { 'Content-Type': 'application/json', ...(as && { 'x-test-clerk-id': as.id, 'x-test-email': as.email || '' }) }
  const r = await fetch(BASE + path, { method, headers, body: body && JSON.stringify(body) })
  return { status: r.status, data: await r.json().catch(() => ({})) }
}
const as = (id, email) => ({ id, email })
const student = as('test_student'), brian = as('test_brian'), grace = as('test_grace'), admin = as('test_admin')
let n = 0
const fresh = () => as(`test_new_${stamp}_${n}`, `t${stamp}x${n++}@test.com`)
const profile = (extra = {}) => ({ role: 'student', name: 'Test Student', university: `Test University ${stamp}`, fieldOfStudy: 'Law', ...extra })

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

test('TC-003 validation: missing field, missing university, admin role, unknown skill, no email', async () => {
  for (const extra of [{ fieldOfStudy: '' }, { university: '' }, { role: 'admin' }, { skills: ['Underwater basket weaving'] }]) {
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
  const who = fresh(); await call('/profile', { method: 'POST', as: who, body: profile() })
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
  assert.equal((await put({ skills: ['Underwater basket weaving'] })).status, 400)
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
