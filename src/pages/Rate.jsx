import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Avatar, PageTitle, Row, Tag, btnLine } from '../components/ui'

// Same order for the same student every time, but unrelated to any match score, so ratings are not biased by ranking.
function shuffled(list, seed) {
  let a = seed >>> 0
  const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
  return arr
}

export default function Rate() {
  const { user } = useAuth()
  const [list, setList] = useState([])
  const [err, setErr] = useState('')
  useEffect(() => { api.rateCandidates().then(setList).catch((e) => setErr(e.message)) }, [])
  const ordered = useMemo(() => shuffled(list, user.id), [list, user.id])
  const done = list.filter((m) => m.rating !== null).length

  const vote = async (id, helpful) => {
    setErr('')
    try { await api.rate(id, helpful); setList((l) => l.map((m) => (m.id === id ? { ...m, rating: helpful } : m))) }
    catch (e) { setErr(e.message) }
  }

  return (
    <>
      <PageTitle title="Help improve matching" sub="Read each profile and say whether this person would be a helpful mentor for you. Your answers train the matching model. They are exported without names, emails or text." />
      {err && <p role="alert" className="mb-4 border-l-4 border-gold bg-white p-3 text-sm">{err}</p>}
      <p className="mb-4 text-sm font-semibold">{done} of {list.length} rated</p>
      <div className="space-y-2">
        {ordered.map((m) => (
          <Row key={m.id} accent={m.rating === null ? 'border-gold' : 'border-navy'}>
            <div className="flex items-start gap-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{m.name}</div>
                <div className="text-sm">{m.jobTitle}{m.company && ` at ${m.company}`}</div>
                <div className="text-sm text-muted">{m.university}, {m.course}</div>
                {m.bio && <p className="mt-2 text-sm">{m.bio}</p>}
                <div className="mt-2 flex flex-wrap gap-1">{[...(m.skills || []), ...(m.interests || [])].map((s) => <Tag key={s}>{s}</Tag>)}</div>
              </div>
              <div className="flex shrink-0 gap-2" role="group" aria-label={`Would ${m.name} be a helpful mentor for you?`}>
                <button className={`${btnLine} ${m.rating === true ? 'bg-navy text-white' : ''}`} aria-pressed={m.rating === true} onClick={() => vote(m.id, true)}>Helpful</button>
                <button className={`${btnLine} ${m.rating === false ? 'bg-navy text-white' : ''}`} aria-pressed={m.rating === false} onClick={() => vote(m.id, false)}>Not for me</button>
              </div>
            </div>
          </Row>
        ))}
        {!list.length && !err && <p className="text-sm text-muted">There are no mentors to rate yet. Ask some alumni to join and opt in to mentoring.</p>}
      </div>
    </>
  )
}
