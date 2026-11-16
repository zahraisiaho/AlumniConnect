// API client. Clerk supplies the session token; every protected request sends it as a Bearer token.
// Default: same-origin /api, forwarded to the backend by the Vite dev server (vite.config.js), so it works on localhost
// and through a tunnel. Set VITE_API_URL (e.g. https://api.example.com/api) for a build served without that proxy.
const BASE = import.meta.env.VITE_API_URL || '/api'
let tokenGetter = null

async function call(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const t = tokenGetter ? await tokenGetter() : null
  if (t) headers.Authorization = `Bearer ${t}`
  let res
  try { res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }) }
  catch { throw new Error('Cannot reach the server. Check that the backend is running.') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const fallback = res.status === 401 ? 'Your session has expired. Please sign in again.'
      : res.status >= 500 ? 'The server is not available right now. Please try again in a moment.' : 'Request failed.'
    throw Object.assign(new Error(data.error || fallback), { status: res.status, code: data.code })
  }
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
  update: (patch) => call('/me', { method: 'PUT', body: patch }),
  // Your data: everything stored about you as a JSON file, and deleting your account (needs confirm: 'DELETE').
  async exportMyData() {
    const t = tokenGetter ? await tokenGetter() : null
    let res
    try { res = await fetch(`${BASE}/me/export`, { headers: t ? { Authorization: `Bearer ${t}` } : {} }) }
    catch { throw new Error('Cannot reach the server. Check your connection and try again.') }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not prepare your data. Please try again.')
    return res.blob()
  },
  deleteMe: () => call('/me', { method: 'DELETE', body: { confirm: 'DELETE' } }),
  universities: () => call('/universities'),
  alumni: (f = {}) => call(`/alumni${qs({ q: f.q, university: f.university, industry: f.industry })}`),
  matches: () => call('/matches'),
  matchingMethod: () => call('/matching-method'),
  requestMentor: (fromId, toId) => call('/requests', { method: 'POST', body: { mentorId: toId } }),
  sentRequests: () => call('/requests/sent').catch((e) => (e.status === 403 ? [] : Promise.reject(e))),
  incoming: () => call('/requests/incoming'),
  respond: (id, status) => call(`/requests/${id}`, { method: 'PATCH', body: { status } }),
  mentorships: () => call('/mentorships'),
  mentorship: (id) => call(`/mentorships/${id}`),   // also marks it as read
  sendMessage: (id, body) => call(`/mentorships/${id}/messages`, { method: 'POST', body: { body } }),
  proposeSession: (id, startsAt, topic) => call(`/mentorships/${id}/sessions`, { method: 'POST', body: { startsAt, topic } }),
  answerSession: (id, sessionId, status) => call(`/mentorships/${id}/sessions/${sessionId}`, { method: 'PATCH', body: { status } }),
  endMentorship: (id) => call(`/mentorships/${id}/end`, { method: 'POST' }),
  reviewMentorship: (id, rating, comment) => call(`/mentorships/${id}/review`, { method: 'POST', body: { rating, comment } }),
  notifications: () => call('/notifications'),
  posts: (category = '') => call(`/posts${qs({ category })}`),
  createPost: (authorId, p) => call('/posts', { method: 'POST', body: p }),
  addReply: (postId, authorId, body) => call(`/posts/${postId}/replies`, { method: 'POST', body: { body } }),
  updates: (university = '') => call(`/updates${qs({ university })}`),
  createUpdate: (d) => call('/updates', { method: 'POST', body: d }),
  adminSummary: () => call('/admin/summary'),
  adminUsers: () => call('/admin/users'),
  rateCandidates: () => call('/rate/candidates'),
  rate: (mentorId, helpful) => call('/rate', { method: 'POST', body: { mentorId, helpful } }),
  async adminExportFeedback() {
    const t = tokenGetter ? await tokenGetter() : null
    let res
    try { res = await fetch(`${BASE}/admin/export/feedback.csv`, { headers: t ? { Authorization: `Bearer ${t}` } : {} }) }
    catch { throw new Error('Cannot reach the server. Check that the backend is running.') }
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Export failed.')
    return res.blob()
  },
  // Sends the CV for reading; returns suggested answers. The server does not store the file or save anything.
  // No Content-Type header here: the browser sets multipart/form-data with its boundary.
  async parseCv(file, { timeoutMs = 90000 } = {}) {
    const t = tokenGetter ? await tokenGetter() : null
    const body = new FormData()
    body.append('cv', file)
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), timeoutMs)
    let res
    try { res = await fetch(`${BASE}/profile/parse-cv`, { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body, signal: abort.signal }) }
    catch (e) {
      throw new Error(e.name === 'AbortError' ? 'Reading your CV took too long. Please try again, or fill in manually.' : 'Cannot reach the server. Check your connection and try again.')
    } finally { clearTimeout(timer) }
    const data = await res.json().catch(() => ({}))   // a proxy or tunnel error page is not JSON
    if (!res.ok) {
      if (data.error) throw new Error(data.error)
      if (res.status === 413) throw new Error('That file is larger than 5 MB. Please upload a smaller file or fill in manually.')
      if (res.status === 401) throw new Error('Your session has expired. Please sign in again.')
      if (res.status >= 500) throw new Error('The server is not available right now. Please try again in a moment.')
      throw new Error('Could not read the CV. Please fill in manually.')
    }
    return data.suggestions || {}
  },
  adminUpdateUser: (id, patch) => call(`/admin/users/${id}`, { method: 'PUT', body: patch }),
  adminDeleteUser: (id) => call(`/admin/users/${id}`, { method: 'DELETE' }),
}
