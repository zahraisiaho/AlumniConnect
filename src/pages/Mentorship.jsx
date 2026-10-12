import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { Avatar, PageTitle, Row, btnLine, btnGold } from '../components/ui'

export default function Mentorship() {
  const { user } = useAuth()
  const [matches, setMatches] = useState([])
  const [incoming, setIncoming] = useState([])
  const [sent, setSent] = useState({})
  const isStudent = user.role === 'student'

  const load = () => {
    if (isStudent) {
      api.matches(user).then(setMatches)
      api.sentRequests(user.id).then((r) => setSent(Object.fromEntries(r.map((x) => [x.toId, x.status]))))
    } else api.incoming(user.id).then(setIncoming)
  }
  useEffect(load, [user.id]) // eslint-disable-line
  const ask = async (id) => { await api.requestMentor(user.id, id); load() }
  const answer = async (id, s) => { await api.respond(id, s); load() }

  if (!isStudent) {
    return (
      <>
        <PageTitle title="Mentorship requests" sub="Students who asked you for guidance." />
        <div className="space-y-2">
          {incoming.map((r) => (
            <Row key={r.id}>
              <div className="flex items-center gap-3">
                <Avatar name={r.from.name} />
                <div className="flex-1"><div className="font-semibold">{r.from.name}</div><div className="text-sm text-muted">{r.from.university}, {r.from.course}</div></div>
                {r.status === 'pending'
                  ? <><button className={btnGold} onClick={() => answer(r.id, 'accepted')}>Accept</button><button className={btnLine} onClick={() => answer(r.id, 'declined')}>Decline</button></>
                  : <span className="text-sm capitalize text-muted">{r.status}</span>}
              </div>
            </Row>
          ))}
          {!incoming.length && <p className="text-sm text-muted">No requests yet. Make sure your profile says you are open to mentoring.</p>}
        </div>
      </>
    )
  }

  return (
    <>
      <PageTitle title="Your mentor matches" sub="Ranked by field of study, skills, interests, industry and availability. Every score shows its reasons." />
      {!user.fieldOfStudy || !user.skills?.length || !user.interests?.length
        ? <p className="mb-4 border-l-4 border-gold bg-white p-3 text-sm">Add your field, skills and interests in <Link to="/profile" className="font-semibold underline">My profile</Link> for better matches.</p> : null}
      <div className="space-y-2">
        {matches.map(({ mentor: m, score, reasons }) => (
          <Row key={m.id}>
            <div className="flex items-start gap-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">{m.name}</span><span className="text-sm font-semibold">{score}% match</span></div>
                <div className="text-sm">{m.jobTitle} at {m.company}, {m.university}</div>
                <div className="my-2 h-2 bg-ice-deep"><div className="h-2 bg-gold" style={{ width: `${score}%` }} /></div>
                <ul className="list-disc pl-5 text-sm text-muted">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
              {sent[m.id] ? <span className="text-sm capitalize text-muted">{sent[m.id]}</span> : <button className={btnLine} onClick={() => ask(m.id)}>Request</button>}
            </div>
          </Row>
        ))}
        {!matches.length && <p className="text-sm text-muted">No matches yet. Complete your profile to see mentors.</p>}
      </div>
    </>
  )
}
