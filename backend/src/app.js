import express from 'express'
import cors from 'cors'
import { pool, q } from './db.js'
import { scoreMatch, semanticBonus } from './matching.js'
import { roleFor } from './roles.js'
import { createHash } from 'node:crypto'
import { cosine, lexicalEmbedder } from './embeddings.js'
import { FEATURES, pairFeatures, predict } from './hybrid.js'
import multer from 'multer'
import { CvError, MAX_CV_BYTES, extractText, kindOf, suggest } from './cv.js'

// CVs are held in memory for the one request only: never written to disk, stored or logged.
const cvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CV_BYTES, files: 1, fields: 0 } }).single('cv')

// embedder turns bio text into vectors; model (optional) is the learned ranking model.
// Matching modes: a loaded model always wins ('hybrid-learned'); otherwise semantic=true adds a bonus for similar bios
// ('rules+meaning'); otherwise rules only ('rules'). semantic defaults to false so tests see the plain rules.
// deleteIdentity(clerkId) removes the sign-in account (Clerk in production, a spy in tests).
// identity(req) returns { clerkId, getEmail(), getName() } or null.
// Production passes a Clerk-backed resolver (server.js). Tests pass a stand-in, so no Clerk keys are needed to test.
export function createApp({ identity, pre = [], deleteIdentity = async () => {}, embedder = lexicalEmbedder, model = null, semantic = false }) {
const app = express()
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))
pre.forEach((m) => app.use(m))
app.use(express.json({ limit: '100kb' }))

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next)
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status })
const who = async (req) => { try { return await identity(req) } catch { return null } }
const adminEmails = () => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)

// Students whose graduation year has passed become alumni automatically (checked on every request).
async function syncRole(u) {
  if (u.role === 'student' && u.grad_year && roleFor(u.grad_year) === 'alumnus') {
    await q("UPDATE users SET role = 'alumnus', updated_at = now() WHERE id = $1", [u.id])
    return 'alumnus'
  }
  return u.role
}

// auth(): signed in with Clerk AND has a profile. auth('admin'): also checks the role stored in our database.
const auth = (...roles) => async (req, res, next) => {
  try {
    const id = await who(req)
    if (!id) return res.status(401).json({ error: 'Please sign in.' })
    const r = await q('SELECT id, role, grad_year FROM users WHERE clerk_user_id = $1', [id.clerkId])
    if (!r.length) return res.status(403).json({ error: 'Complete your profile first.', code: 'NO_PROFILE' })
    req.user = { id: r[0].id, role: await syncRole(r[0]) }
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have permission to do that.' })
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
// Skills come from the list or are typed in by the user. A typed skill reuses an existing one (ignoring case),
// otherwise it is added to the list so that other people can match on it too.
async function skillIds(names) {
  const list = [...new Set((names || []).map((n) => String(n || '').trim().replace(/\s+/g, ' ')).filter(Boolean))]
  if (list.length > 30) throw bad('Choose at most 30 skills.')
  const ids = []
  for (const n of list) {
    if (n.length > 40) throw bad(`Skill names must be 40 characters or fewer: ${n}`)
    const r = await q('SELECT id FROM skills WHERE lower(name) = lower($1)', [n])
    ids.push(r.length ? r[0].id : (await q('INSERT INTO skills (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id', [n]))[0].id)
  }
  return ids
}
async function setLinks(userId, table, col, ids) {
  await q(`DELETE FROM ${table} WHERE user_id = $1`, [userId])
  for (const id of ids) await q(`INSERT INTO ${table} (user_id, ${col}) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, id])
}

// ---------- text similarity (cached per profile) ----------
async function vectorFor(u, provider) {
  const text = String(u.bio || '').trim()
  if (!text) return null
  const hash = createHash('sha1').update(`${provider}|${text}`).digest('hex')
  const r = await q('SELECT text_hash, vector FROM profile_embeddings WHERE user_id = $1', [u.id])
  if (r[0]?.text_hash === hash) return r[0].vector
  const vector = await embedder.embed(text)
  await q(`INSERT INTO profile_embeddings (user_id, provider, text_hash, vector) VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id) DO UPDATE SET provider = $2, text_hash = $3, vector = $4, updated_at = now()`, [u.id, provider, hash, JSON.stringify(vector)])
  return vector
}
async function similarities(student, mentors) {
  const provider = await embedder.ready()
  const sv = await vectorFor(student, provider)
  const sims = new Map()
  for (const m of mentors) sims.set(m.id, sv ? cosine(sv, (await vectorFor(m, provider)) || null) : 0)
  return { provider, sims }
}
const round2 = (x) => Math.round(x * 100) / 100

// Runs fn in one database transaction; fn gets a query function like q.
async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn((text, params) => client.query(text, params).then((r) => r.rows))
    await client.query('COMMIT')
    return out
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e }
  finally { client.release() }
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
  const gradYear = Number(d.gradYear)
  if (!Number.isInteger(gradYear) || gradYear < 1980 || gradYear > 2040) throw bad('Enter your graduation year (or the year you expect to graduate).')
  const role = roleFor(gradYear)   // a role sent by the client is ignored
  if (!String(d.name || '').trim()) throw bad('Name is required.')
  if (!d.fieldOfStudy) throw bad('Field of study is required.')
  if (!String(d.university || '').trim()) throw bad('University is required.')
  if ((await q('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])).length) throw bad('A profile with this email already exists.', 409)
  const [field, industry, avail, skills, interests] = await Promise.all([
    idOf('fields_of_study', 'field of study', d.fieldOfStudy), idOf('industries', 'industry', d.industry),
    idOf('availability_options', 'availability', d.availability), skillIds(d.skills), idsOf('interests', 'interest', d.interests),
  ])
  const uni = await universityId(d.university)
  const [{ uid }] = await q(
    `INSERT INTO users (clerk_user_id, email, name, role, university_id, course, field_id, grad_year, industry_id, job_title, company, availability_id, is_mentor, bio)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id AS uid`,
    [id.clerkId, email, d.name.trim(), role, uni, d.course || null, field, gradYear, industry,
      role === 'alumnus' ? d.jobTitle || null : null, role === 'alumnus' ? d.company || null : null, avail, role === 'alumnus' && !!d.mentor, d.bio ? String(d.bio).trim().slice(0, 1000) || null : null])
  await setLinks(uid, 'user_skills', 'skill_id', skills)
  await setLinks(uid, 'user_interests', 'interest_id', interests)
  const [user] = await getUsers('WHERE u.id = $1', [uid])
  res.status(201).json(user)
}))

// ---------- suggestions from a CV ----------
// Any signed-in person, including someone still completing their profile. Returns suggestions only: nothing is saved.
app.post('/api/profile/parse-cv', wrap(async (req, res) => {
  const id = await who(req)
  if (!id) return res.status(401).json({ error: 'Please sign in.' })
  try { await new Promise((resolve, reject) => cvUpload(req, res, (e) => (e ? reject(e) : resolve()))) }
  catch (e) {
    if (e.code === 'LIMIT_FILE_SIZE') throw bad('That file is larger than 5 MB. Please upload a smaller file or fill in manually.', 413)
    throw bad('Choose a PDF or Word (.docx) file to upload.')
  }
  if (!req.file) throw bad('Choose a PDF or Word (.docx) file to upload.')
  const kind = kindOf(req.file.originalname, req.file.buffer)
  if (!kind) throw bad('Please upload a PDF or Word (.docx) file.', 415)
  if (kind === 'mismatch') throw bad("We couldn't read text from this file; please fill in manually.", 422)
  let text
  try { text = await extractText(req.file.buffer, kind) }
  catch (e) { throw e instanceof CvError ? bad(e.message, e.status) : bad("We couldn't read text from this file; please fill in manually.", 422) }
  const names = (table) => q(`SELECT name FROM ${table} ORDER BY id`).then((r) => r.map((x) => x.name))
  const [universities, fields, industries, skills] = await Promise.all(['universities', 'fields_of_study', 'industries', 'skills'].map(names))
  res.set('Cache-Control', 'no-store').json({ suggestions: suggest(text, { universities, fields, industries, skills }) })
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
  if (rows.length) {
    const nr = await syncRole({ id: rows[0].id, role: rows[0].role, grad_year: rows[0].gradYear })
    if (nr !== rows[0].role) rows = await getUsers('WHERE u.clerk_user_id = $1', [id.clerkId])
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
  if ('gradYear' in d && d.gradYear !== '' && d.gradYear != null) {
    const y = Number(d.gradYear)
    if (!Number.isInteger(y) || y < 1980 || y > 2040) throw bad('Enter a valid graduation year.')
    if (!allowRole && role !== 'admin' && roleFor(y) !== role) { role = roleFor(y); add('role', role) }   // role follows graduation year
  }
  if ('name' in d) { if (!String(d.name).trim()) throw bad('Name is required.'); add('name', d.name.trim()) }
  for (const [k, col] of [['course', 'course'], ['jobTitle', 'job_title'], ['company', 'company'], ['bio', 'bio']]) if (k in d) add(col, k === 'bio' ? String(d.bio || '').trim().slice(0, 1000) || null : d[k] || null)
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
  const skills = 'skills' in d ? await skillIds(d.skills) : null
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
  const meaning = !model && semantic
  let sims = new Map(); let usable = false
  if (model) {   // text similarity is only used when it comes from the same embedding provider the model was trained with
    const r = await similarities(me, mentors); sims = r.sims
    usable = !model.embedding_provider || model.embedding_provider === r.provider
  } else if (meaning) sims = (await similarities(me, mentors)).sims   // no bio on either side gives similarity 0
  const out = mentors.map((m) => {
    const rule = scoreMatch(me, m)
    const rulesOnly = { mentor: publicUser(m), score: rule.score, reasons: rule.reasons, ruleScore: rule.score, method: 'rules' }
    if (!model) {
      const sim = meaning ? sims.get(m.id) || 0 : 0
      const bonus = semanticBonus(sim)
      if (!bonus) return rulesOnly
      return { mentor: publicUser(m), score: Math.min(100, rule.score + bonus), reasons: [...rule.reasons, `Similar goals in their bios (${Math.round(100 * sim)}% similar)`],
        ruleScore: rule.score, similarity: round2(sim), method: 'rules+meaning' }
    }
    const sim = usable ? sims.get(m.id) || 0 : 0
    const p = predict(model, pairFeatures(me, m, sim))
    const reasons = [...rule.reasons]
    if (sim >= 0.3) reasons.push(`Profiles describe similar goals (text similarity ${sim.toFixed(2)})`)
    return { mentor: publicUser(m), score: Math.round(100 * p), reasons, ruleScore: rule.score, similarity: round2(sim), method: 'hybrid-learned' }
  }).filter((x) => (x.method === 'hybrid-learned' ? x.ruleScore > 0 || x.similarity >= 0.3 : x.score > 0))   // rules+meaning can add people from other fields
    .sort((a, b) => b.score - a.score || a.mentor.name.localeCompare(b.mentor.name))
    .slice(0, 10)
  // Refresh the cached scores. Rows with a status are real mentorships (with their chat and sessions): never deleted here.
  await q('DELETE FROM mentorship_matches WHERE student_id = $1 AND status IS NULL', [me.id])
  for (const x of out) {
    await q(`INSERT INTO mentorship_matches (student_id, mentor_id, score, reasons) VALUES ($1,$2,$3,$4)
             ON CONFLICT (student_id, mentor_id) DO UPDATE SET score = EXCLUDED.score, reasons = EXCLUDED.reasons, generated_at = now()`,
    [me.id, x.mentor.id, x.score, JSON.stringify(x.reasons)])
  }
  res.json(out)
}))

// ---------- tester ratings (training data for the learned model) ----------
// Mentors are listed without any score, in an order that does not depend on the ranking, so ratings are not biased by position.
app.get('/api/rate/candidates', auth('student'), wrap(async (req, res) => {
  const mentors = await getUsers("WHERE u.role = 'alumnus' AND u.is_mentor AND u.id <> $1 ORDER BY u.id LIMIT 30", [req.user.id])
  const given = new Map((await q('SELECT mentor_id, helpful FROM match_feedback WHERE student_id = $1', [req.user.id])).map((r) => [r.mentor_id, r.helpful]))
  res.json(mentors.map((m) => ({ ...publicUser(m), rating: given.has(m.id) ? given.get(m.id) : null })))
}))

app.post('/api/rate', auth('student'), wrap(async (req, res) => {
  const mentorId = Number(req.body?.mentorId)
  if (typeof req.body?.helpful !== 'boolean') throw bad('Answer yes or no.')
  if (!(await q("SELECT 1 FROM users WHERE id = $1 AND role = 'alumnus' AND is_mentor", [mentorId])).length) throw bad('That person is not available as a mentor.', 404)
  await q(`INSERT INTO match_feedback (student_id, mentor_id, helpful) VALUES ($1,$2,$3)
           ON CONFLICT (student_id, mentor_id) DO UPDATE SET helpful = $3, updated_at = now()`, [req.user.id, mentorId, req.body.helpful])
  res.status(201).json({ ok: true })
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

// Accepting starts (or reuses) the pair's mentorship. A mentor can have at most MAX_MENTEES active mentees.
const MAX_MENTEES = 5
app.patch('/api/requests/:id', auth('alumnus'), wrap(async (req, res) => {
  const status = req.body?.status
  if (!['accepted', 'declined'].includes(status)) throw bad('Status must be accepted or declined.')
  const requestId = Number(req.params.id) || 0
  const r = await q('SELECT student_id, mentor_id, status FROM mentorship_requests WHERE id = $1', [requestId])
  if (!r.length) throw bad('Request not found.', 404)
  if (r[0].mentor_id !== req.user.id) throw bad('Only the mentor who received this request can answer it.', 403)
  if (status === 'declined') {
    if (r[0].status === 'accepted') throw bad('You already accepted this request. End the mentorship in My mentorships instead.', 409)
    await q('UPDATE mentorship_requests SET status = $1, responded_at = now() WHERE id = $2', [status, requestId])
    return res.json({ ok: true })
  }
  const { student_id: studentId, mentor_id: mentorId } = r[0]
  const [student, mentor] = await Promise.all([studentId, mentorId].map(async (id) => (await getUsers('WHERE u.id = $1', [id]))[0]))
  const rule = scoreMatch(student, mentor)
  const mentorshipId = await tx(async (t) => {
    await t('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [mentorId])   // one acceptance at a time per mentor, so the limit holds
    const cur = (await t('SELECT id, status FROM mentorship_matches WHERE student_id = $1 AND mentor_id = $2', [studentId, mentorId]))[0]
    if (cur?.status === 'ended') throw bad('This mentorship has already ended.', 409)
    let id = cur?.status === 'active' ? cur.id : null
    if (!id) {
      const [{ n }] = await t("SELECT count(*)::int AS n FROM mentorship_matches WHERE mentor_id = $1 AND status = 'active'", [mentorId])
      if (n >= MAX_MENTEES) throw bad(`You already have ${MAX_MENTEES} active mentees. End a mentorship before accepting another request.`, 409)
      id = (await t(`INSERT INTO mentorship_matches (student_id, mentor_id, score, reasons, status, started_at) VALUES ($1,$2,$3,$4,'active',now())
                     ON CONFLICT (student_id, mentor_id) DO UPDATE SET status = 'active', started_at = now() RETURNING id`,
      [studentId, mentorId, rule.score, JSON.stringify(rule.reasons)]))[0].id
      // The mentor has seen this mentorship (they just accepted it); the student has not, so it shows as new for them.
      await t(`INSERT INTO mentorship_reads (match_id, user_id) VALUES ($1,$2) ON CONFLICT (match_id, user_id) DO UPDATE SET last_read_at = now()`, [id, mentorId])
    }
    await t("UPDATE mentorship_requests SET status = 'accepted', responded_at = COALESCE(responded_at, now()) WHERE id = $1", [requestId])
    return id
  })
  res.json({ ok: true, mentorshipId })
}))

// ---------- mentorships (after acceptance): chat, sessions, ending, review ----------
// Only the student and the mentor in a mentorship can see or change anything in it. Administrators are not
// participants, so they get 403 here too; the admin summary shows counts only.
const SEEN = "COALESCE(rd.last_read_at, '-infinity'::timestamptz)"
const MENTORSHIP_SQL = `
  SELECT m.id, m.status, m.student_id, m.mentor_id, m.started_at AS "startedAt", m.ended_at AS "endedAt", (rv.id IS NOT NULL) AS reviewed,
         (m.student_id = $1 AND m.started_at > ${SEEN})::int AS "unreadAccepted",
         (SELECT count(*)::int FROM messages x WHERE x.match_id = m.id AND x.sender_id <> $1 AND x.created_at > ${SEEN}) AS "unreadMessages",
         (SELECT count(*)::int FROM mentoring_sessions s WHERE s.match_id = m.id AND s.status = 'proposed' AND s.proposed_by <> $1
            AND s.created_at > ${SEEN}) AS "unreadSessions"
  FROM mentorship_matches m
  LEFT JOIN mentorship_reviews rv ON rv.match_id = m.id
  LEFT JOIN mentorship_reads rd ON rd.match_id = m.id AND rd.user_id = $1
  WHERE m.status IS NOT NULL AND $1 IN (m.student_id, m.mentor_id)`

async function mentorshipsOf(userId, where = '', params = []) {
  const rows = await q(`${MENTORSHIP_SQL} ${where} ORDER BY (m.status = 'active') DESC, m.started_at DESC`, [userId, ...params])
  const otherIds = rows.map((m) => (m.student_id === userId ? m.mentor_id : m.student_id))
  const others = new Map((otherIds.length ? await getUsers('WHERE u.id = ANY($1)', [otherIds]) : []).map((u) => [u.id, publicUser(u)]))
  return rows.map(({ student_id: sid, mentor_id: mid, unreadAccepted, unreadMessages, unreadSessions, reviewed, ...m }) => {
    const myRole = sid === userId ? 'student' : 'mentor'
    const o = others.get(myRole === 'student' ? mid : sid) || {}
    return {
      ...m, myRole, reviewed,
      canReview: myRole === 'student' && m.status === 'ended' && !reviewed,
      other: { id: o.id, name: o.name, role: myRole === 'student' ? 'mentor' : 'student', jobTitle: o.jobTitle, company: o.company, course: o.course, university: o.university },
      unread: { accepted: unreadAccepted, messages: unreadMessages, sessions: unreadSessions, total: unreadAccepted + unreadMessages + unreadSessions },
    }
  })
}

// Loads a mentorship the signed-in user takes part in: 404 if there is none, 403 if they are not one of the two people.
async function participantIn(req) {
  const r = await q('SELECT id, student_id, mentor_id, status FROM mentorship_matches WHERE id = $1 AND status IS NOT NULL', [Number(req.params.id) || 0])
  if (!r.length) throw bad('Mentorship not found.', 404)
  if (![r[0].student_id, r[0].mentor_id].includes(req.user.id)) throw bad('Only the two people in this mentorship can see it.', 403)
  return r[0]
}
const mustBeActive = (m, what) => { if (m.status !== 'active') throw bad(`This mentorship has ended, so ${what}.`, 409) }

// Records that the user has seen everything up to `at` (taken before reading, so nothing arriving meanwhile is skipped).
const markRead = (matchId, userId, at) => q(
  `INSERT INTO mentorship_reads (match_id, user_id, last_read_at) VALUES ($1,$2,$3)
   ON CONFLICT (match_id, user_id) DO UPDATE SET last_read_at = GREATEST(mentorship_reads.last_read_at, EXCLUDED.last_read_at)`, [matchId, userId, at])
const dbNow = async () => (await q('SELECT now() AS at'))[0].at

const listMessages = async (matchId, userId) => (await q(
  'SELECT id, sender_id AS "senderId", body, created_at AS "createdAt" FROM messages WHERE match_id = $1 ORDER BY created_at, id', [matchId]))
  .map((x) => ({ ...x, mine: x.senderId === userId }))
const listSessions = async (matchId, userId) => (await q(
  `SELECT id, proposed_by AS "proposedBy", starts_at AS "startsAt", topic, status, created_at AS "createdAt",
          (starts_at > now() AND status IN ('proposed', 'confirmed')) AS upcoming
   FROM mentoring_sessions WHERE match_id = $1 ORDER BY starts_at`, [matchId]))
  .map((s) => ({ ...s, mine: s.proposedBy === userId }))

app.get('/api/mentorships', auth(), wrap(async (req, res) => res.json(await mentorshipsOf(req.user.id))))

app.get('/api/notifications', auth(), wrap(async (req, res) => {
  const unread = (await mentorshipsOf(req.user.id)).reduce((t, m) => {
    for (const k of Object.keys(t)) t[k] += m.unread[k]
    return t
  }, { accepted: 0, messages: 0, sessions: 0, total: 0 })
  res.json({ mentorships: unread.total, ...unread })
}))

// Everything on one mentorship (polled by the page every 10 seconds). Opening it marks it as read.
app.get('/api/mentorships/:id', auth(), wrap(async (req, res) => {
  const m = await participantIn(req)
  const at = await dbNow()
  const [messages, sessions] = await Promise.all([listMessages(m.id, req.user.id), listSessions(m.id, req.user.id)])
  await markRead(m.id, req.user.id, at)
  const [summary] = await mentorshipsOf(req.user.id, 'AND m.id = $2', [m.id])
  res.json({ ...summary, messages, sessions })
}))

app.get('/api/mentorships/:id/messages', auth(), wrap(async (req, res) => {
  const m = await participantIn(req)
  const at = await dbNow()
  const messages = await listMessages(m.id, req.user.id)
  await markRead(m.id, req.user.id, at)
  res.json(messages)
}))

app.post('/api/mentorships/:id/messages', auth(), wrap(async (req, res) => {
  const m = await participantIn(req)
  mustBeActive(m, 'messages are read-only')
  const body = String(req.body?.body ?? '').trim()
  if (!body) throw bad('Write a message first.')
  if (body.length > 2000) throw bad('Messages can be at most 2000 characters.')
  const [x] = await q('INSERT INTO messages (match_id, sender_id, body) VALUES ($1,$2,$3) RETURNING id, created_at AS "createdAt"', [m.id, req.user.id, body])
  res.status(201).json({ ...x, senderId: req.user.id, body, mine: true })
}))

app.get('/api/mentorships/:id/sessions', auth(), wrap(async (req, res) => {
  const m = await participantIn(req)
  res.json(await listSessions(m.id, req.user.id))
}))

app.post('/api/mentorships/:id/sessions', auth(), wrap(async (req, res) => {
  const m = await participantIn(req)
  mustBeActive(m, 'new sessions cannot be proposed')
  const startsAt = new Date(req.body?.startsAt)
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) throw bad('Choose a date and time in the future.')
  const topic = String(req.body?.topic ?? '').trim()
  if (!topic || topic.length > 200) throw bad('Add a topic of up to 200 characters.')
  const [s] = await q('INSERT INTO mentoring_sessions (match_id, proposed_by, starts_at, topic) VALUES ($1,$2,$3,$4) RETURNING id', [m.id, req.user.id, startsAt, topic])
  res.status(201).json((await listSessions(m.id, req.user.id)).find((x) => x.id === s.id))
}))

// confirmed / declined: only the person who did NOT propose it, while it is proposed. cancelled: either person, before it starts.
app.patch('/api/mentorships/:id/sessions/:sid', auth(), wrap(async (req, res) => {
  const m = await participantIn(req)
  const status = req.body?.status
  if (!['confirmed', 'declined', 'cancelled'].includes(status)) throw bad('Status must be confirmed, declined or cancelled.')
  const s = (await q('SELECT id, proposed_by, status, starts_at FROM mentoring_sessions WHERE id = $1 AND match_id = $2', [Number(req.params.sid) || 0, m.id]))[0]
  if (!s) throw bad('Session not found.', 404)
  mustBeActive(m, 'sessions cannot be changed')
  if (s.starts_at <= new Date()) throw bad('This session time has already passed.', 409)
  if (status === 'cancelled') {
    if (!['proposed', 'confirmed'].includes(s.status)) throw bad(`This session is already ${s.status}.`, 409)
  } else {
    if (s.proposed_by === req.user.id) throw bad('Only the other person can confirm or decline a session you proposed.', 403)
    if (s.status !== 'proposed') throw bad(`This session is already ${s.status}.`, 409)
  }
  await q('UPDATE mentoring_sessions SET status = $1 WHERE id = $2', [status, s.id])
  res.json((await listSessions(m.id, req.user.id)).find((x) => x.id === s.id))
}))

// Either person can end it. Messages become read-only and sessions that have not happened yet are cancelled.
app.post('/api/mentorships/:id/end', auth(), wrap(async (req, res) => {
  const m = await participantIn(req)
  mustBeActive(m, 'it cannot be ended again')
  await tx(async (t) => {
    await t("UPDATE mentorship_matches SET status = 'ended', ended_at = now(), ended_by = $2 WHERE id = $1 AND status = 'active'", [m.id, req.user.id])
    await t("UPDATE mentoring_sessions SET status = 'cancelled' WHERE match_id = $1 AND status IN ('proposed', 'confirmed') AND starts_at > now()", [m.id])
  })
  res.json((await mentorshipsOf(req.user.id, 'AND m.id = $2', [m.id]))[0])
}))

// Only the student, only after it has ended, only once.
app.post('/api/mentorships/:id/review', auth(), wrap(async (req, res) => {
  const m = await participantIn(req)
  if (m.student_id !== req.user.id) throw bad('Only the student can review this mentorship.', 403)
  if (m.status !== 'ended') throw bad('You can review the mentorship once it has ended.', 409)
  const rating = Number(req.body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw bad('Choose a rating from 1 to 5.')
  const comment = String(req.body?.comment ?? '').trim()
  if (comment.length > 500) throw bad('Comments can be at most 500 characters.')
  const r = await q('INSERT INTO mentorship_reviews (match_id, rating, comment) VALUES ($1,$2,$3) ON CONFLICT (match_id) DO NOTHING RETURNING id', [m.id, rating, comment || null])
  if (!r.length) throw bad('You have already reviewed this mentorship.', 409)
  res.status(201).json({ ok: true })
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
          (SELECT count(*)::int FROM updates) AS updates,
          (SELECT count(*)::int FROM mentorship_matches WHERE status = 'active') AS "activeMentorships",
          (SELECT count(*)::int FROM mentoring_sessions) AS sessions,
          (SELECT count(*)::int FROM mentorship_reviews) AS reviews,
          (SELECT round(avg(rating), 1)::float FROM mentorship_reviews) AS "averageRating"`))[0])))   // counts only: never message text

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

// Training data for the Colab notebook: ids and numbers only, no names, emails or text.
app.get('/api/admin/export/feedback.csv', auth('admin'), wrap(async (req, res) => {
  const rows = await q('SELECT student_id, mentor_id, helpful, created_at FROM match_feedback ORDER BY student_id, mentor_id')
  const provider = await embedder.ready()
  const users = new Map((await getUsers('')).map((u) => [u.id, u]))
  const cache = new Map()
  const vec = async (u) => { if (!cache.has(u.id)) cache.set(u.id, await vectorFor(u, provider)); return cache.get(u.id) }
  const lines = [['student_id', 'mentor_id', 'helpful', 'rule_score', ...FEATURES, 'sim_provider', 'created_at'].join(',')]
  for (const r of rows) {
    const s = users.get(r.student_id); const m = users.get(r.mentor_id)
    if (!s || !m) continue
    const sv = await vec(s); const mv = await vec(m)
    const f = pairFeatures(s, m, sv && mv ? cosine(sv, mv) : 0)
    lines.push([r.student_id, r.mentor_id, r.helpful ? 1 : 0, scoreMatch(s, m).score, ...FEATURES.map((k) => f[k].toFixed(6)), provider, new Date(r.created_at).toISOString()].join(','))
  }
  res.set('Content-Type', 'text/csv; charset=utf-8')
  res.set('Content-Disposition', 'attachment; filename="alumniconnect_feedback.csv"')
  res.send(lines.join('\n') + '\n')
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
