import express from 'express'
import cors from 'cors'
import { q } from './db.js'
import { scoreMatch } from './matching.js'

// deleteIdentity(clerkId) removes the sign-in account (Clerk in production, a spy in tests).
// identity(req) returns { clerkId, getEmail(), getName() } or null.
// Production passes a Clerk-backed resolver (server.js). Tests pass a stand-in, so no Clerk keys are needed to test.
export function createApp({ identity, pre = [], deleteIdentity = async () => {} }) {
const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))
pre.forEach((m) => app.use(m))
app.use(express.json({ limit: '100kb' }))

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next)
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status })
const who = async (req) => { try { return await identity(req) } catch { return null } }
const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

// auth(): signed in with Clerk AND has a profile. auth('admin'): also checks the role stored in our database.
const auth = (...roles) => async (req, res, next) => {
  try {
    const id = await who(req)
    if (!id) return res.status(401).json({ error: 'Please sign in.' })
    const r = await q('SELECT id, role FROM users WHERE clerk_user_id = $1', [id.clerkId])
    if (!r.length) return res.status(403).json({ error: 'Complete your profile first.', code: 'NO_PROFILE' })
    req.user = r[0]
    if (roles.length && !roles.includes(r[0].role)) return res.status(403).json({ error: 'You do not have permission to do that.' })
    next()
  } catch (e) { next(e) }
}

// ---------- helpers ----------
const USER_SQL = `
  SELECT u.id, u.name, u.email, u.role, uni.name AS university, u.course, f.name AS "fieldOfStudy",
         u.grad_year AS "gradYear", i.name AS industry, u.job_title AS "jobTitle", u.company,
         a.name AS availability, COALESCE(u.bio, '') AS bio, u.is_mentor AS mentor, u.created_at AS "createdAt",
         COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id), '{}') AS skills,
         COALESCE((SELECT array_agg(it.name ORDER BY it.name) FROM user_interests ui JOIN interests it ON it.id = ui.interest_id WHERE ui.user_id = u.id), '{}') AS interests
  FROM users u
  LEFT JOIN universities uni ON uni.id = u.university_id
  LEFT JOIN fields_of_study f ON f.id = u.field_id
  LEFT JOIN industries i ON i.id = u.industry_id
  LEFT JOIN availability_options a ON a.id = u.availability_id`
const getUsers = (where = '', params = []) => q(`${USER_SQL} ${where}`, params)
const publicUser = ({ email, ...rest }) => rest   // email is never shown to other users

async function idOf(table, label, name) {
  if (!name) return null
  const r = await q(`SELECT id FROM ${table} WHERE name = $1`, [name])
  if (!r.length) throw bad(`Unknown ${label}: ${name}`)
  return r[0].id
}
const idsOf = (table, label, names) => Promise.all((names || []).map((n) => idOf(table, label, n)))

async function universityId(name) {
  const n = String(name || '').trim()
  if (!n) throw bad('University is required.')
  const r = await q('SELECT id FROM universities WHERE lower(name) = lower($1)', [n])
  if (r.length) return r[0].id
  return (await q('INSERT INTO universities (name) VALUES ($1) RETURNING id', [n]))[0].id
}
async function setLinks(userId, table, col, ids) {
  await q(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
  for (const id of ids) await q(`INSERT INTO ${table} (user_id, ${col}) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, id])
}

// ---------- health and public lists ----------
app.get('/api/health', wrap(async (req, res) => { await q('SELECT 1'); res.json({ ok: true }) }))
app.get('/api/universities', wrap(async (req, res) => res.json((await q('SELECT name FROM universities ORDER BY name')).map((r) => r.name))))

// ---------- profile creation (after Clerk sign-up) ----------
app.post('/api/profile', wrap(async (req, res) => {
  const id = await who(req)
  if (!id) return res.status(401).json({ error: 'Please sign in.' })
  if ((await q('SELECT 1 FROM users WHERE clerk_user_id = $1', [id.clerkId])).length) throw bad('Your profile already exists.', 409)
  const d = req.body || {}
  const email = String((await id.getEmail()) || '').trim()
  if (!email) throw bad('Your account needs a verified email address.')
  if (!['student', 'alumnus'].includes(d.role)) throw bad('Choose student or alumnus.')
  if (!String(d.name || '').trim()) throw bad('Name is required.')
  if (!d.fieldOfStudy) throw bad('Field of study is required.')
  if (!String(d.university || '').trim()) throw bad('University is required.')
  if ((await q('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).length) throw bad('A profile with this email already exists.', 409)
  const [field, industry, avail, skills, interests] = await Promise.all([
    idOf('fields_of_study', 'field of study', d.fieldOfStudy), idOf('industries', 'industry', d.industry),
    idOf('availability_options', 'availability', d.availability), idsOf('skills', 'skill', d.skills), idsOf('interests', 'interest', d.interests),
  ])
  const uni = await universityId(d.university)
  const [{ uid }] = await q(
    `INSERT INTO users (clerk_user_id, email, name, role, university_id, course, field_id, grad_year, industry_id, job_title, company, availability_id, is_mentor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id AS uid`,
    [id.clerkId, email, d.name.trim(), d.role, uni, d.course || null, field, Number(d.gradYear) || null, industry,
      d.role === 'alumnus' ? d.jobTitle || null : null, d.role === 'alumnus' ? d.company || null : null, avail, d.role === 'alumnus' && !!d.mentor])
  await setLinks(uid, 'user_skills', 'skill_id', skills)
  await setLinks(uid, 'user_interests', 'interest_id', interests)
  const [user] = await getUsers('WHERE u.id = $1', [uid])
  res.status(201).json(user)
}))

// ---------- my profile ----------
// The first sign-in of an email listed in ADMIN_EMAILS creates the administrator profile. Everyone else completes a profile.
app.get('/api/me', wrap(async (req, res) => {
  const id = await who(req)
  if (!id) return res.status(401).json({ error: 'Please sign in.' })
  let rows = await getUsers('WHERE u.clerk_user_id = $1', [id.clerkId])
  if (!rows.length) {
    const email = String((await id.getEmail()) || '').trim()
    if (email && adminEmails().includes(email.toLowerCase()) && !(await q('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).length) {
      const name = (await id.getName?.()) || email.split('@')[0]
      await q("INSERT INTO users (clerk_user_id, email, name, role) VALUES ($1,$2,$3,'admin')", [id.clerkId, email, name])
      rows = await getUsers('WHERE u.clerk_user_id = $1', [id.clerkId])
    }
  }
  if (!rows.length) return res.status(404).json({ error: 'Complete your profile first.', code: 'NO_PROFILE' })
  res.json(rows[0])
}))

// Applies a profile change. Used by "my profile" and by the administrator's edit screen.
async function applyPatch(userId, currentRole, d, { allowRole = false } = {}) {
  const sets = []; const vals = []
  const add = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`) }
  let role = currentRole
  if (allowRole && 'role' in d) {
    if (!['student', 'alumnus', 'admin'].includes(d.role)) throw bad('Role must be student, alumnus or admin.')
    role = d.role; add('role', role)
  }
  if ('name' in d) { if (!String(d.name).trim()) throw bad('Name is required.'); add('name', d.name.trim()) }
  for (const [k, col] of [['course', 'course'], ['jobTitle', 'job_title'], ['company', 'company'], ['bio', 'bio']]) if (k in d) add(col, d[k] || null)
  if ('gradYear' in d) add('grad_year', Number(d.gradYear) || null)
  if ('university' in d && (d.university || role !== 'admin')) add('university_id', await universityId(d.university))
  if (role !== 'admin') {
    const cur = await q('SELECT university_id FROM users WHERE id = $1', [userId])
    if (!cur[0]?.university_id && !d.university) throw bad('Choose a university first.')
  }
  if ('fieldOfStudy' in d) add('field_id', await idOf('fields_of_study', 'field of study', d.fieldOfStudy))
  if ('industry' in d) add('industry_id', await idOf('industries', 'industry', d.industry))
  if ('availability' in d) add('availability_id', await idOf('availability_options', 'availability', d.availability))
  if (role !== 'alumnus') {
    if (d.mentor) throw bad('Only alumni can be mentors.')
    if (role !== currentRole || 'mentor' in d) add('is_mentor', false)
  } else if ('mentor' in d) add('is_mentor', !!d.mentor)
  const skills = 'skills' in d ? await idsOf('skills', 'skill', d.skills) : null
  const interests = 'interests' in d ? await idsOf('interests', 'interest', d.interests) : null
  if (sets.length) { add('updated_at', new Date()); await q(`UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length + 1}`, [...vals, userId]) }
  if (skills) await setLinks(userId, 'user_skills', 'skill_id', skills)
  if (interests) await setLinks(userId, 'user_interests', 'interest_id', interests)
  return (await getUsers('WHERE u.id = $1', [userId]))[0]
}

app.put('/api/me', auth(), wrap(async (req, res) => res.json(await applyPatch(req.user.id, req.user.role, req.body || {}))))

// ---------- directory ----------
app.get('/api/alumni', auth(), wrap(async (req, res) => {
  const { q: term = '', university = '', industry = '' } = req.query
  const rows = await getUsers(
    `WHERE u.role = 'alumnus' AND ($1 = '' OR uni.name = $1) AND ($2 = '' OR i.name = $2)
       AND ($3 = '' OR position(lower($3) in lower(concat_ws(' ', u.name, u.job_title, u.company, u.course, f.name,
            (SELECT string_agg(s.name, ' ') FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id)))) > 0)
     ORDER BY u.name`, [String(university), String(industry), String(term).trim()])
  res.json(rows.map(publicUser))
}))

// ---------- mentorship ----------
app.get('/api/matches', auth('student'), wrap(async (req, res) => {
  const [me] = await getUsers('WHERE u.id = $1', [req.user.id])
  const mentors = await getUsers("WHERE u.role = 'alumnus' AND u.is_mentor AND u.id <> $1", [me.id])
  const out = mentors.map((m) => ({ mentor: publicUser(m), ...scoreMatch(me, m) })).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.mentor.name.localeCompare(b.mentor.name))
  await q('DELETE FROM mentorship_matches WHERE student_id = $1', [me.id])
  for (const x of out) await q('INSERT INTO mentorship_matches (student_id, mentor_id, score, reasons) VALUES ($1,$2,$3,$4)', [me.id, x.mentor.id, x.score, JSON.stringify(x.reasons)])
  res.json(out)
}))

app.post('/api/requests', auth('student'), wrap(async (req, res) => {
  const mentorId = Number(req.body?.mentorId)
  if (!(await q("SELECT 1 FROM users WHERE id = $1 AND role = 'alumnus' AND is_mentor", [mentorId])).length) throw bad('That person is not available as a mentor.', 404)
  await q('INSERT INTO mentorship_requests (student_id, mentor_id) VALUES ($1,$2) ON CONFLICT (student_id, mentor_id) DO NOTHING', [req.user.id, mentorId])
  res.status(201).json({ ok: true })
}))

app.get('/api/requests/sent', auth('student'), wrap(async (req, res) =>
  res.json(await q('SELECT mentor_id AS "toId", status FROM mentorship_requests WHERE student_id = $1', [req.user.id]))))

app.get('/api/requests/incoming', auth('alumnus'), wrap(async (req, res) => {
  const rows = await q(
    `SELECT r.id, r.status, r.created_at AS "createdAt", s.id AS "studentId", s.name, uni.name AS university, s.course
     FROM mentorship_requests r JOIN users s ON s.id = r.student_id LEFT JOIN universities uni ON uni.id = s.university_id
     WHERE r.mentor_id = $1 ORDER BY r.created_at DESC`, [req.user.id])
  res.json(rows.map(({ studentId, name, university, course, ...r }) => ({ ...r, from: { id: studentId, name, university, course } })))
}))

app.patch('/api/requests/:id', auth('alumnus'), wrap(async (req, res) => {
  const status = req.body?.status
  if (!['accepted', 'declined'].includes(status)) throw bad('Status must be accepted or declined.')
  const r = await q('SELECT mentor_id FROM mentorship_requests WHERE id = $1', [Number(req.params.id) || 0])
  if (!r.length) throw bad('Request not found.', 404)
  if (r[0].mentor_id !== req.user.id) throw bad('Only the mentor who received this request can answer it.', 403)
  await q('UPDATE mentorship_requests SET status = $1, responded_at = now() WHERE id = $2', [status, Number(req.params.id)])
  res.json({ ok: true })
}))

// ---------- forum ----------
app.get('/api/posts', auth(), wrap(async (req, res) => {
  const posts = await q(
    `SELECT p.id, p.title, p.body, p.category, p.created_at AS "createdAt", p.author_id AS "authorId", u.name AS author
     FROM forum_posts p JOIN users u ON u.id = p.author_id WHERE ($1 = '' OR p.category = $1) ORDER BY p.created_at DESC, p.id DESC`, [String(req.query.category || '')])
  const replies = posts.length ? await q(
    `SELECT r.id, r.post_id AS "postId", r.body, r.created_at AS "createdAt", u.name AS author
     FROM forum_replies r JOIN users u ON u.id = r.author_id WHERE r.post_id = ANY($1) ORDER BY r.created_at, r.id`, [posts.map((p) => p.id)]) : []
  res.json(posts.map((p) => ({ ...p, replies: replies.filter((r) => r.postId === p.id) })))
}))

app.post('/api/posts', auth(), wrap(async (req, res) => {
  const { title = '', body = '', category = '' } = req.body || {}
  if (!String(title).trim() || !String(body).trim()) throw bad('Title and message are required.')
  const [{ id }] = await q('INSERT INTO forum_posts (author_id, title, body, category) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.id, String(title).trim(), String(body).trim(), category])
  res.status(201).json({ id })
}))

app.post('/api/posts/:id/replies', auth(), wrap(async (req, res) => {
  const body = String(req.body?.body || '').trim()
  if (!body) throw bad('Reply cannot be empty.')
  const [{ id }] = await q('INSERT INTO forum_replies (post_id, author_id, body) VALUES ($1,$2,$3) RETURNING id', [Number(req.params.id) || 0, req.user.id, body])
  res.status(201).json({ id })
}))

// ---------- institutional updates ----------
app.get('/api/updates', auth(), wrap(async (req, res) => res.json(await q(
  `SELECT n.id, n.title, n.body, n.created_at AS "createdAt", COALESCE(uni.name, '') AS university
   FROM updates n LEFT JOIN universities uni ON uni.id = n.university_id
   WHERE ($1 = '' OR n.university_id IS NULL OR uni.name = $1) ORDER BY n.created_at DESC, n.id DESC`, [String(req.query.university || '')]))))

app.post('/api/updates', auth('admin'), wrap(async (req, res) => {
  const { title = '', body = '', university = '' } = req.body || {}
  if (!String(title).trim() || !String(body).trim()) throw bad('Headline and details are required.')
  const uid = university ? await idOf('universities', 'university', university) : null
  const [{ id }] = await q('INSERT INTO updates (title, body, university_id, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [String(title).trim(), String(body).trim(), uid, req.user.id])
  res.status(201).json({ id })
}))

// ---------- admin ----------
app.get('/api/admin/summary', auth('admin'), wrap(async (req, res) => res.json((await q(
  `SELECT (SELECT count(*)::int FROM users WHERE role = 'student') AS students,
          (SELECT count(*)::int FROM users WHERE role = 'alumnus') AS alumni,
          (SELECT count(*)::int FROM users WHERE is_mentor) AS mentors,
          (SELECT count(*)::int FROM universities) AS universities,
          (SELECT count(*)::int FROM forum_posts) AS posts,
          (SELECT count(*)::int FROM mentorship_requests) AS requests,
          (SELECT count(*)::int FROM mentorship_requests WHERE status = 'pending') AS pending,
          (SELECT count(*)::int FROM updates) AS updates`))[0])))

app.get('/api/admin/users', auth('admin'), wrap(async (req, res) =>
  res.json(await getUsers('ORDER BY u.created_at DESC, u.id DESC LIMIT 500'))))

app.put('/api/admin/users/:id', auth('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id) || 0
  const d = req.body || {}
  const r = await q('SELECT role FROM users WHERE id = $1', [id])
  if (!r.length) throw bad('User not found.', 404)
  if (id === req.user.id && 'role' in d && d.role !== 'admin') throw bad('You cannot remove your own admin role.')
  res.json(await applyPatch(id, r[0].role, d, { allowRole: true }))
}))

app.delete('/api/admin/users/:id', auth('admin'), wrap(async (req, res) => {
  const id = Number(req.params.id) || 0
  if (id === req.user.id) throw bad('You cannot delete your own account here.')
  const r = await q('SELECT clerk_user_id FROM users WHERE id = $1', [id])
  if (!r.length) throw bad('User not found.', 404)
  if (r[0].clerk_user_id) {
    try { await deleteIdentity(r[0].clerk_user_id) }
    catch (e) { if (e?.status !== 404) throw bad('Could not remove the sign-in account, so nothing was changed.', 502) }
  }
  await q('DELETE FROM users WHERE id = $1', [id])   // requests, matches, posts and replies cascade
  res.json({ ok: true })
}))

// ---------- errors ----------
app.use((req, res) => res.status(404).json({ error: 'Not found.' }))
app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
  const pgMap = { 23505: [409, 'That record already exists.'], 23514: [400, 'One of the values is not allowed.'], 23503: [404, 'Related record not found.'] }
  let status = 500; let msg = 'Something went wrong on the server.'
  if (err.status) { status = err.status; msg = err.message } else if (pgMap[err.code]) [status, msg] = pgMap[err.code]
  if (status === 500) console.error(err)
  res.status(status).json({ error: msg })
})

return app
}
