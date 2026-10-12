// Mock backend stored in localStorage. Replace these functions with axios calls later.
import { universities as baseUnis } from '../data/options'

const KEY = 'ac_db_v1'
const SES = 'ac_session'
const uid = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()
const safe = (u) => { if (!u) return null; const { password, ...rest } = u; return rest }
const save = (d) => localStorage.setItem(KEY, JSON.stringify(d))

const mk = (id, name, email, role, university, course, fieldOfStudy, gradYear, industry, jobTitle, company, skills, interests, availability) => ({
  id, name, email, password: 'password123', role, university, course, fieldOfStudy, gradYear, industry,
  jobTitle, company, skills, interests, availability, bio: '', mentor: role === 'alumnus',
})

function seed() {
  const users = [
    mk('u1', 'Amina Wanjiru', 'student@demo.com', 'student', 'Strathmore University', 'BSc Informatics & Computer Science', 'Computer Science', 2026, 'Technology', '', '', ['Python', 'React', 'SQL'], ['Career guidance', 'Internships abroad', 'Technical skills'], 'Weekday evenings'),
    mk('u2', 'Brian Otieno', 'alumni@demo.com', 'alumnus', 'University of Nairobi', 'BSc Computer Science', 'Computer Science', 2018, 'Technology', 'Senior Engineer', 'Nile Systems', ['Python', 'Cloud', 'SQL'], ['Technical skills', 'Career guidance'], 'Weekday evenings'),
    mk('u3', 'Grace Mutua', 'grace@demo.com', 'alumnus', 'Strathmore University', 'BSc Information Technology', 'Information Technology', 2016, 'Telecommunications', 'Security Lead', 'Savanna Telecom', ['Cybersecurity', 'Cloud', 'Leadership'], ['Career guidance', 'Leadership growth'], 'Weekends'),
    mk('u4', 'Kwame Mensah', 'kwame@demo.com', 'alumnus', 'University of Ghana', 'BSc Accounting', 'Finance & Accounting', 2015, 'Finance & Banking', 'Risk Manager', 'Gold Coast Bank', ['Financial modelling', 'Data analysis', 'Leadership'], ['Leadership growth', 'Postgraduate study'], 'Weekends'),
    mk('u5', 'Neema Kimaro', 'neema@demo.com', 'alumnus', 'University of Dar es Salaam', 'BEng Electrical Engineering', 'Engineering', 2017, 'Agriculture & Energy', 'Project Engineer', 'SolarWave', ['Project management', 'Research'], ['Starting a business', 'Networking'], 'Flexible'),
    mk('u6', 'Sarah Njeri', 'sarah@demo.com', 'alumnus', 'Kenyatta University', 'BA Graphic Design', 'Design & Media', 2019, 'Technology', 'Product Designer', 'Kilimani Labs', ['UI/UX design', 'JavaScript', 'React'], ['Internships abroad', 'CV & interview prep'], 'Weekends'),
    mk('u7', 'Daniel Kato', 'daniel@demo.com', 'alumnus', 'Makerere University', 'BSc Computer Science', 'Computer Science', 2014, 'Technology', 'Engineering Manager', 'Lake Victoria Digital', ['Machine learning', 'Python', 'Leadership'], ['Postgraduate study', 'Technical skills'], 'Once a month'),
    mk('u8', 'Zawadi Ali', 'zawadi@demo.com', 'alumnus', 'University of Cape Town', 'MPH Public Health', 'Medicine & Health Sciences', 2013, 'Healthcare', 'Public Health Analyst', 'Cape Health Trust', ['Research', 'Data analysis'], ['Postgraduate study', 'Work-life balance'], 'Flexible'),
    { ...mk('u0', 'Platform Admin', 'admin@demo.com', 'admin', '', '', '', '', '', 'Administrator', 'AlumniConnect', [], [], ''), mentor: false },
  ]
  const posts = [
    { id: 'p1', authorId: 'u2', title: 'What I wish I knew before my first engineering job', body: 'Learn to read other people’s code early. Most of the job is that, not writing new code.', category: 'Career advice', createdAt: now(), replies: [] },
    { id: 'p2', authorId: 'u1', title: 'Looking for internships abroad for 2027', body: 'Has anyone found remote or placement-based internships outside Africa? Where did you look?', category: 'Jobs & internships', createdAt: now(), replies: [{ id: 'r1', authorId: 'u6', body: 'Try your university career office first, then programmes like AIESEC. Apply early.', createdAt: now() }] },
    { id: 'p3', authorId: 'u5', title: 'Starting a small solar business: where to begin?', body: 'Happy to share what worked for me. Ask here and I will reply.', category: 'Entrepreneurship', createdAt: now(), replies: [] },
  ]
  const updates = [
    { id: 'n1', title: 'Mentorship matching is open', body: 'Students can now be matched with alumni from any university. Complete your profile to improve your matches.', university: '', createdAt: now() },
    { id: 'n2', title: 'Strathmore alumni networking evening', body: 'Join fellow Strathmore graduates for an evening of networking.', university: 'Strathmore University', createdAt: now() },
    { id: 'n3', title: 'Makerere careers week', body: 'Alumni talks and CV clinics during careers week.', university: 'Makerere University', createdAt: now() },
  ]
  return { users, posts, updates, requests: [] }
}

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.users) return d } catch { /* reseed */ }
  const d = seed(); save(d); return d
}

const overlap = (a = [], b = []) => a.filter((x) => b.includes(x))

// Rule-based matching: weighted attribute rules, fully explainable. Max score 100.
export function scoreMatch(s, m) {
  let score = 0; const reasons = []
  if (s.fieldOfStudy && s.fieldOfStudy === m.fieldOfStudy) { score += 30; reasons.push(`Same field of study: ${m.fieldOfStudy}`) }
  const sk = overlap(s.skills, m.skills)
  if (sk.length) { score += Math.min(25, sk.length * 8); reasons.push(`Shared skills: ${sk.join(', ')}`) }
  const it = overlap(s.interests, m.interests)
  if (it.length) { score += Math.min(25, it.length * 12); reasons.push(`Shared mentorship interests: ${it.join(', ')}`) }
  if (s.industry && s.industry === m.industry) { score += 10; reasons.push(`Works in ${m.industry}`) }
  if (s.availability && s.availability === m.availability) { score += 5; reasons.push(`Both available: ${m.availability}`) }
  if (s.university && s.university === m.university) { score += 5; reasons.push('Same university') }
  return { score, reasons }
}

export const api = {
  async me() { const id = localStorage.getItem(SES); return safe(load().users.find((u) => u.id === id)) },
  async login(email, password) {
    const u = load().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.password === password)
    if (!u) throw new Error('Email or password is incorrect.')
    localStorage.setItem(SES, u.id); return safe(u)
  },
  async register(data) {
    const d = load()
    if (d.users.some((u) => u.email.toLowerCase() === data.email.trim().toLowerCase())) throw new Error('An account with this email already exists.')
    const u = { ...data, id: uid(), email: data.email.trim(), bio: data.bio || '', mentor: data.role === 'alumnus' ? !!data.mentor : false }
    d.users.push(u); save(d); localStorage.setItem(SES, u.id); return safe(u)
  },
  logout() { localStorage.removeItem(SES) },
  async update(id, patch) {
    const d = load(); const i = d.users.findIndex((u) => u.id === id)
    d.users[i] = { ...d.users[i], ...patch, id, email: d.users[i].email, password: d.users[i].password, role: d.users[i].role }
    save(d); return safe(d.users[i])
  },
  async universities() { return [...new Set([...baseUnis, ...load().users.map((u) => u.university).filter(Boolean)])].sort() },
  async alumni({ q = '', university = '', industry = '' } = {}) {
    const t = q.trim().toLowerCase()
    return load().users.filter((u) => u.role === 'alumnus')
      .filter((u) => !university || u.university === university)
      .filter((u) => !industry || u.industry === industry)
      .filter((u) => !t || [u.name, u.jobTitle, u.company, u.course, u.fieldOfStudy, ...(u.skills || [])].join(' ').toLowerCase().includes(t))
      .map(safe)
  },
  async matches(user) {
    return load().users.filter((u) => u.role === 'alumnus' && u.mentor && u.id !== user.id)
      .map((m) => ({ mentor: safe(m), ...scoreMatch(user, m) }))
      .filter((m) => m.score > 0).sort((a, b) => b.score - a.score)
  },
  async requestMentor(fromId, toId) {
    const d = load()
    if (!d.requests.some((r) => r.fromId === fromId && r.toId === toId)) d.requests.push({ id: uid(), fromId, toId, status: 'pending', createdAt: now() })
    save(d)
  },
  async sentRequests(fromId) { return load().requests.filter((r) => r.fromId === fromId) },
  async incoming(toId) {
    const d = load()
    return d.requests.filter((r) => r.toId === toId).map((r) => ({ ...r, from: safe(d.users.find((u) => u.id === r.fromId)) }))
  },
  async respond(id, status) { const d = load(); const r = d.requests.find((x) => x.id === id); if (r) r.status = status; save(d) },
  async posts(category = '') {
    const d = load(); const name = (id) => d.users.find((u) => u.id === id)?.name || 'Member'
    return d.posts.filter((p) => !category || p.category === category)
      .map((p) => ({ ...p, author: name(p.authorId), replies: p.replies.map((r) => ({ ...r, author: name(r.authorId) })) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async createPost(authorId, { title, body, category }) {
    const d = load(); d.posts.push({ id: uid(), authorId, title: title.trim(), body: body.trim(), category, createdAt: now(), replies: [] }); save(d)
  },
  async addReply(postId, authorId, body) {
    const d = load(); d.posts.find((p) => p.id === postId)?.replies.push({ id: uid(), authorId, body: body.trim(), createdAt: now() }); save(d)
  },
  async updates(university = '') {
    return load().updates.filter((n) => !university || !n.university || n.university === university)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },
  async createUpdate({ title, body, university }) {
    const d = load(); d.updates.push({ id: uid(), title: title.trim(), body: body.trim(), university, createdAt: now() }); save(d)
  },
}
