import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { PageTitle, Row, Field, input, btn } from '../components/ui'

export default function Updates() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [unis, setUnis] = useState([])
  const [uni, setUni] = useState(user.university || '')
  const [d, setD] = useState({ title: '', body: '', university: '' })

  const load = () => api.updates(uni).then(setList)
  useEffect(() => { api.universities().then(setUnis) }, [])
  useEffect(() => { load() }, [uni]) // eslint-disable-line

  const post = async (e) => {
    e.preventDefault()
    if (!d.title.trim() || !d.body.trim()) return
    await api.createUpdate(d); setD({ title: '', body: '', university: '' }); load()
  }

  return (
    <>
      <PageTitle title="Updates" sub="News from the platform and from universities." />
      <div className="mb-4 max-w-xs">
        <Field label="Show news for">
          <select className={input} value={uni} onChange={(e) => setUni(e.target.value)}>
            <option value="">All universities</option>{unis.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      {user.role === 'admin' && (
        <form onSubmit={post} className="mb-6 space-y-3 border-l-4 border-navy bg-white p-4">
          <Field label="Headline"><input className={input} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></Field>
          <Field label="Details"><textarea rows={3} className={input} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} /></Field>
          <div className="flex items-end gap-3">
            <Field label="Audience"><select className={input} value={d.university} onChange={(e) => setD({ ...d, university: e.target.value })}><option value="">Everyone</option>{unis.map((u) => <option key={u}>{u}</option>)}</select></Field>
            <button className={btn}>Publish update</button>
          </div>
        </form>
      )}
      <div className="space-y-2">
        {list.map((n) => (
          <Row key={n.id} accent={n.university ? 'border-navy-soft' : 'border-gold'}>
            <div className="text-xs text-muted">{n.university || 'All universities'}, {new Date(n.createdAt).toLocaleDateString()}</div>
            <h3 className="mt-1 text-lg font-bold">{n.title}</h3>
            <p className="mt-1 text-sm">{n.body}</p>
          </Row>
        ))}
        {!list.length && <p className="text-sm text-muted">No updates for this university yet.</p>}
      </div>
    </>
  )
}
