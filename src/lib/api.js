// API client. Clerk supplies the session token; every protected request sends it as a Bearer token.
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
let tokenGetter = null

async function call(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const t = tokenGetter ? await tokenGetter() : null
  if (t) headers.Authorization = `Bearer ${t}`
  let res
  try { res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }) }
  catch { throw new Error('Cannot reach the server. Check that the backend is running.') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed.'), { status: res.status, code: data.code })
  return data
}
const qs = (o) => {
  const p = new URLSearchParams()
  Object.entries(o).forEach(([k, v]) => v && p.set(k, v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const api = {
  setTokenGetter(fn) { tokenGetter = fn },
  async me() {
    try { return { user: await call('/me') } }
    catch (e) { if (e.code === 'NO_PROFILE') return { needsProfile: true }; throw e }
  },
  createProfile: (data) => call('/profile', { method: 'POST', body: data }),
  update: (id, patch) => call('/me', { method: 'PUT', body: patch }),
  universities: () => call('/universities'),
  alumni: (f = {}) => call(`/alumni${qs({ q: f.q, university: f.university, industry: f.industry })}`),
  matches: () => call('/matches'),
  requestMentor: (fromId, toId) => call('/requests', { method: 'POST', body: { mentorId: toId } }),
  sentRequests: () => call('/requests/sent').catch((e) => (e.status === 403 ? [] : Promise.reject(e))),
  incoming: () => call('/requests/incoming'),
  respond: (id, status) => call(`/requests/${id}`, { method: 'PATCH', body: { status } }),
  posts: (category = '') => call(`/posts${qs({ category })}`),
  createPost: (authorId, p) => call('/posts', { method: 'POST', body: p }),
  addReply: (postId, authorId, body) => call(`/posts/${postId}/replies`, { method: 'POST', body: { body } }),
  updates: (university = '') => call(`/updates${qs({ university })}`),
  createUpdate: (d) => call('/updates', { method: 'POST', body: d }),
  adminSummary: () => call('/admin/summary'),
  adminUsers: () => call('/admin/users'),
  adminUpdateUser: (id, patch) => call(`/admin/users/${id}`, { method: 'PUT', body: patch }),
  adminDeleteUser: (id) => call(`/admin/users/${id}`, { method: 'DELETE' }),
}
