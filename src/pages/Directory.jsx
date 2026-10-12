import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { industries } from '../data/options'
import { Avatar, PageTitle, Row, Tag, input, btnLine } from '../components/ui'

export default function Directory() {
  const { user } = useAuth()
  const [f, setF] = useState({ q: '', university: '', industry: '' })
  const [list, setList] = useState([])
  const [unis, setUnis] = useState([])
  const [sent, setSent] = useState({})

  useEffect(() => { api.universities().then(setUnis); api.sentRequests(user.id).then((r) => setSent(Object.fromEntries(r.map((x) => [x.toId, true])))) }, [user.id])
  useEffect(() => { api.alumni(f).then(setList) }, [f])
  const ask = async (id) => { await api.requestMentor(user.id, id); setSent((s) => ({ ...s, [id]: true })) }

  return (
    <>
      <PageTitle title="Alumni directory" sub="Browse graduates from every university on the platform." />
      <div className="mb-4 grid gap-2 md:grid-cols-3">
        <input className={input} placeholder="Search name, role, skill" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search" />
        <select className={input} value={f.university} onChange={(e) => setF({ ...f, university: e.target.value })} aria-label="University">
          <option value="">All universities</option>{unis.map((u) => <option key={u}>{u}</option>)}
        </select>
        <select className={input} value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} aria-label="Industry">
          <option value="">All industries</option>{industries.map((i) => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {list.map((a) => (
          <Row key={a.id}>
            <div className="flex items-start gap-3">
              <Avatar name={a.name} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{a.name}</div>
                <div className="text-sm">{a.jobTitle}{a.company && ` at ${a.company}`}</div>
                <div className="text-sm text-muted">{a.university}, {a.course} ({a.gradYear})</div>
                <div className="mt-2 flex flex-wrap gap-1">{(a.skills || []).map((s) => <Tag key={s}>{s}</Tag>)}</div>
              </div>
              {user.role === 'student' && a.mentor && (
                sent[a.id] ? <span className="text-sm text-muted">Requested</span> : <button className={btnLine} onClick={() => ask(a.id)}>Request mentorship</button>
              )}
            </div>
          </Row>
        ))}
        {!list.length && <p className="text-sm text-muted">No alumni match these filters. Clear a filter to see more.</p>}
      </div>
    </>
  )
}
