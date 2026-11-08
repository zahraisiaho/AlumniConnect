import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { Avatar, Field, PageTitle, Row, btn, btnGold, btnLine, input } from '../components/ui'

const POLL_MS = 10000   // the page refreshes every 10 seconds (no websockets)
const when = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const localNow = () => { const d = new Date(Date.now() + 5 * 60000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const about = (o) => [o.role === 'mentor' ? [o.jobTitle, o.company].filter(Boolean).join(' at ') : o.course, o.university].filter(Boolean).join(', ')
const Alert = ({ children }) => (children ? <p role="alert" className="border-l-4 border-gold bg-white p-3 text-sm">{children}</p> : null)
const Badge = ({ n }) => (n ? <span className="rounded-full bg-gold px-2 text-xs font-semibold text-navy" aria-label={`${n} unread`}>{n}</span> : null)

export default function Mentorships() {
  const [params, setParams] = useSearchParams()
  const selected = Number(params.get('id')) || null
  const [list, setList] = useState(null)
  const [detail, setDetail] = useState(null)
  const [err, setErr] = useState('')

  const reload = useCallback(async () => {
    try {
      setList(await api.mentorships())
      if (selected) {
        setDetail(await api.mentorship(selected))
        window.dispatchEvent(new Event('mentorships:read'))   // update the sidebar badge now
      }
      setErr('')
    } catch (e) { setErr(e.message) }
  }, [selected])

  useEffect(() => {
    setDetail(null)
    reload()
    const t = setInterval(() => { if (!document.hidden) reload() }, POLL_MS)
    return () => clearInterval(t)
  }, [reload])

  if (selected) {
    return (
      <>
        <button className="mb-4 text-sm underline" onClick={() => setParams({})}>Back to my mentorships</button>
        <Alert>{err}</Alert>
        {detail ? <Detail d={detail} reload={reload} /> : !err && <p className="text-sm text-muted">Loading…</p>}
      </>
    )
  }

  const active = (list || []).filter((m) => m.status === 'active')
  const ended = (list || []).filter((m) => m.status === 'ended')
  const item = (m) => (
    <Row key={m.id} accent={m.status === 'active' ? 'border-gold' : 'border-ice-deep'}>
      <button className="flex w-full items-center gap-3 text-left" onClick={() => setParams({ id: String(m.id) })}>
        <Avatar name={m.other.name} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{m.other.name} <span className="text-xs font-normal text-muted">your {m.other.role}</span></div>
          <div className="truncate text-sm text-muted">{about(m.other)}</div>
        </div>
        <Badge n={m.unread.total} />
        <span className="text-sm capitalize text-muted">{m.canReview ? 'Ended: please review' : m.status}</span>
      </button>
    </Row>
  )

  return (
    <>
      <PageTitle title="My mentorships" sub="Your active and past mentorships. Chat, plan sessions and, once it ends, say how it went." />
      <Alert>{err}</Alert>
      {list && !list.length && (
        <p className="text-sm text-muted">No mentorships yet. They start when a mentor accepts a request on the <Link to="/mentorship" className="underline">Mentorship</Link> page.</p>
      )}
      {!!active.length && <h2 className="mb-2 mt-4 font-semibold">Active</h2>}
      <div className="space-y-2">{active.map(item)}</div>
      {!!ended.length && <h2 className="mb-2 mt-6 font-semibold">Ended</h2>}
      <div className="space-y-2">{ended.map(item)}</div>
    </>
  )
}

function Detail({ d, reload }) {
  const [err, setErr] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const active = d.status === 'active'
  const act = async (fn) => { setErr(''); try { await fn(); await reload() } catch (e) { setErr(e.message) } }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={d.other.name} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{d.other.name}</h1>
          <div className="text-sm text-muted">Your {d.other.role}{about(d.other) ? ` · ${about(d.other)}` : ''}</div>
          <div className="text-xs text-muted">Started {when(d.startedAt)}{d.endedAt ? ` · Ended ${when(d.endedAt)}` : ''}</div>
        </div>
        {active && !confirmEnd && <button className={btnLine} onClick={() => setConfirmEnd(true)}>End mentorship</button>}
      </div>
      {confirmEnd && (
        <div className="border-l-4 border-gold bg-white p-3 text-sm">
          <p>End this mentorship? Messages become read-only and sessions that have not happened yet are cancelled.</p>
          <div className="mt-2 flex gap-2">
            <button className={btnGold} onClick={() => act(async () => { await api.endMentorship(d.id); setConfirmEnd(false) })}>Yes, end it</button>
            <button className={btnLine} onClick={() => setConfirmEnd(false)}>Keep it</button>
          </div>
        </div>
      )}
      <Alert>{err}</Alert>
      {d.canReview && <Review id={d.id} name={d.other.name} reload={reload} />}
      {d.myRole === 'student' && d.reviewed && <p className="text-sm text-muted">Thank you, your review is saved.</p>}
      <Sessions d={d} act={act} />
      <Chat d={d} reload={reload} />
    </div>
  )
}

function Sessions({ d, act }) {
  const [startsAt, setStartsAt] = useState('')
  const [topic, setTopic] = useState('')
  const active = d.status === 'active'
  const upcoming = d.sessions.filter((s) => s.upcoming)
  const past = d.sessions.filter((s) => !s.upcoming)
  const answer = (s, status) => act(() => api.answerSession(d.id, s.id, status))
  const propose = (e) => {
    e.preventDefault()
    act(async () => { await api.proposeSession(d.id, new Date(startsAt).toISOString(), topic); setStartsAt(''); setTopic('') })
  }
  const line = (s) => (
    <li key={s.id} className="flex flex-wrap items-center gap-2 border-b border-ice-deep py-2 text-sm last:border-0">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{s.topic}</div>
        <div className="text-muted">{when(s.startsAt)} · {s.mine ? 'you proposed' : `${d.other.name} proposed`} · <span className="capitalize">{s.status}</span></div>
      </div>
      {active && s.upcoming && s.status === 'proposed' && !s.mine && (
        <><button className={btnGold} onClick={() => answer(s, 'confirmed')}>Confirm</button><button className={btnLine} onClick={() => answer(s, 'declined')}>Decline</button></>
      )}
      {active && s.upcoming && <button className={btnLine} onClick={() => answer(s, 'cancelled')}>Cancel</button>}
    </li>
  )

  return (
    <section aria-labelledby="sessions-title">
      <h2 id="sessions-title" className="mb-2 font-semibold">Sessions</h2>
      {upcoming.length ? <ul className="bg-white px-3">{upcoming.map(line)}</ul> : <p className="text-sm text-muted">No upcoming sessions.</p>}
      {active && (
        <form onSubmit={propose} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="w-52"><Field label="Date and time"><input className={input} type="datetime-local" required min={localNow()} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field></div>
          <div className="min-w-48 flex-1"><Field label="Topic"><input className={input} required maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. CV review" /></Field></div>
          <button className={btn}>Propose session</button>
        </form>
      )}
      {!!past.length && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-muted">Past and closed sessions ({past.length})</summary>
          <ul className="bg-white px-3">{past.map(line)}</ul>
        </details>
      )}
    </section>
  )
}

function Chat({ d, reload }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef(null)
  const active = d.status === 'active'
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [d.messages.length])

  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await api.sendMessage(d.id, text); setText(''); await reload() }
    catch (x) { setErr(x.message) }   // the text stays in the box so nothing is lost
    finally { setBusy(false) }
  }

  return (
    <section aria-labelledby="chat-title">
      <h2 id="chat-title" className="mb-2 font-semibold">Messages</h2>
      <div className="max-h-96 space-y-2 overflow-y-auto bg-white p-3" aria-live="polite">
        {d.messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm ${m.mine ? 'bg-navy text-white' : 'bg-ice'}`}>
              {m.body}
              <div className={`mt-1 text-[11px] ${m.mine ? 'text-ice-deep' : 'text-muted'}`}>{m.mine ? 'You' : d.other.name} · {when(m.createdAt)}</div>
            </div>
          </div>
        ))}
        {!d.messages.length && <p className="text-sm text-muted">No messages yet.{active ? ' Say hello.' : ''}</p>}
        <div ref={end} />
      </div>
      {active ? (
        <form onSubmit={send} className="mt-2 space-y-1">
          <textarea className={input} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Message to ${d.other.name}`} placeholder="Write a message" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{text.length}/2000</span>
            <button className={btn} disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
          </div>
          <Alert>{err}</Alert>
        </form>
      ) : <p className="mt-2 text-sm text-muted">This mentorship has ended, so the messages are read-only.</p>}
    </section>
  )
}

function Review({ id, name, reload }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault(); setErr('')
    if (!rating) return setErr('Choose a rating from 1 to 5.')
    try { await api.reviewMentorship(id, rating, comment); await reload() } catch (x) { setErr(x.message) }
  }
  return (
    <form onSubmit={submit} className="space-y-2 border border-ice-deep bg-white p-4">
      <h2 className="font-semibold">How was your mentorship with {name}?</h2>
      <fieldset>
        <legend className="mb-1 text-sm">Overall rating (1 is poor, 5 is excellent)</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" aria-pressed={rating === n} onClick={() => setRating(n)}
              className={`h-9 w-9 rounded-full border text-sm font-semibold ${rating >= n ? 'border-gold bg-gold text-navy' : 'border-ice-deep bg-white'}`}>{n}</button>
          ))}
        </div>
      </fieldset>
      <Field label="Comment (optional)"><textarea className={input} rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      <div className="flex items-center justify-between"><span className="text-xs text-muted">{comment.length}/500</span><button className={btn}>Submit review</button></div>
      <Alert>{err}</Alert>
    </form>
  )
}
