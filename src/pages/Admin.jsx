import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { PageTitle, Row, Field, input, btn, btnLine } from '../components/ui'
import ProfileFields, { toForm, fromForm } from '../components/ProfileFields'

export default function Admin() {
  const { user } = useAuth()
  const [s, setS] = useState(null)
  const [users, setUsers] = useState([])
  const [f, setF] = useState({ q: '', role: '' })
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => Promise.all([api.adminSummary(), api.adminUsers()]).then(([a, b]) => { setS(a); setUsers(b) }).catch((e) => setErr(e.message))
  useEffect(() => { if (user.role === 'admin') load() }, [user.role]) // eslint-disable-line

  if (user.role !== 'admin') return <Navigate to="/directory" replace />

  const stats = s ? [['Students', s.students], ['Alumni', s.alumni], ['Mentors', s.mentors], ['Universities', s.universities], ['Forum posts', s.posts], ['Mentorship requests', s.requests], ['Pending requests', s.pending], ['Updates', s.updates]] : []
  const shown = users.filter((u) => (!f.role || u.role === f.role) && (!f.q || `${u.name} ${u.email} ${u.university || ''}`.toLowerCase().includes(f.q.toLowerCase())))

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setErr(''); setMsg('')
    try {
      const { id, email, password, createdAt, ...patch } = fromForm(edit)
      await api.adminUpdateUser(edit.id, patch)
      setMsg(`Saved changes for ${edit.name}.`); setEdit(null); await load()
    } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.name} (${u.email})?\n\nThis removes their profile, mentorship requests and forum posts, and their sign-in account. It cannot be undone.`)) return
    setErr(''); setMsg('')
    try { await api.adminDeleteUser(u.id); setMsg(`Deleted ${u.name}.`); if (edit?.id === u.id) setEdit(null); await load() }
    catch (x) { setErr(x.message) }
  }

  return (
    <>
      <PageTitle title="Admin" sub="Live figures, and view or edit every account." />
      {err && <p role="alert" className="mb-4 border-l-4 border-gold bg-white p-3 text-sm">{err}</p>}
      {msg && <p role="status" className="mb-4 border-l-4 border-navy bg-white p-3 text-sm">{msg}</p>}
      <div className="mb-8 grid grid-cols-2 gap-2 md:grid-cols-4">
        {stats.map(([label, value]) => (
          <Row key={label}><div className="text-2xl font-bold">{value}</div><div className="text-sm text-muted">{label}</div></Row>
        ))}
      </div>

      {edit && (
        <form onSubmit={save} className="mb-8 space-y-4 border-l-4 border-navy bg-white p-4">
          <h2 className="text-xl font-bold">Edit {edit.name}</h2>
          <p className="text-sm text-muted">{edit.email} (email is managed by sign-in and cannot be changed here)</p>
          <Field label="Full name"><input className={input} value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Role">
            <select className={input} value={edit.role} disabled={edit.id === user.id} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
              <option value="student">Student or recent graduate</option>
              <option value="alumnus">Alumnus</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
          {edit.role !== 'admin' && (
            <>
              <ProfileFields v={edit} set={setEdit} section="academic" />
              <ProfileFields v={edit} set={setEdit} section="career" />
            </>
          )}
          <div className="flex gap-3">
            <button className={btn} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
            <button type="button" className={btnLine} onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </form>
      )}

      <h2 className="mb-2 text-xl font-bold">Accounts ({shown.length} of {users.length})</h2>
      <div className="mb-3 grid gap-2 md:grid-cols-3">
        <input className={input} placeholder="Search name, email, university" aria-label="Search accounts" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select className={input} aria-label="Filter by role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="">All roles</option><option value="student">Students</option><option value="alumnus">Alumni</option><option value="admin">Administrators</option>
        </select>
      </div>
      <div className="overflow-x-auto bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ice-deep"><tr>{['Name', 'Email', 'Role', 'University', 'Mentor', 'Joined', ''].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} className="border-t border-ice-deep">
                <td className="px-3 py-2">{u.name}</td><td className="px-3 py-2">{u.email}</td><td className="px-3 py-2 capitalize">{u.role}</td>
                <td className="px-3 py-2">{u.university || 'None'}</td><td className="px-3 py-2">{u.mentor ? 'Yes' : 'No'}</td>
                <td className="px-3 py-2">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <button className={`${btnLine} mr-2`} onClick={() => { setErr(''); setMsg(''); setEdit(toForm(u)); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit</button>
                  {u.id === user.id ? <span className="text-xs text-muted">You</span> : <button className={btnLine} onClick={() => remove(u)}>Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="p-3 text-sm text-muted">No accounts match.</p>}
      </div>
    </>
  )
}
