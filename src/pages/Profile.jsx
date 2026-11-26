import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageTitle, Avatar, Field, Suggested, input, btn, btnLine } from '../components/ui'
import { VisibilityPicker, PrivacySummary, ConsentBox } from '../components/Privacy'
import ProfileFields, { toForm, fromForm } from '../components/ProfileFields'
import { roleFor } from '../lib/role'
import { nameProblem, NAME_MAX } from '../lib/name'
import CvFill, { applySuggestions } from '../components/CvFill'

// Only the fields a person can change are sent. Mentoring is only for alumni, so when the graduation year makes
// someone a student it is sent as false (the server rejects mentor: true for students).
function payloadFor(v, role) {
  const f = fromForm(v)
  if (role === 'admin') return { name: f.name, bio: f.bio }
  const keys = ['name', 'bio', 'visibility', 'university', 'course', 'fieldOfStudy', 'gradYear', 'industry', 'jobTitle', 'company', 'skills', 'interests', 'availability']
  const p = Object.fromEntries(keys.filter((k) => k in f).map((k) => [k, f[k]]))
  p.mentor = role === 'alumnus' && !!f.mentor
  return p
}

export default function Profile() {
  const { user, update } = useAuth()
  const needsConsent = !user.privacyConsentAt && user.role !== 'admin'   // accounts made before the privacy notice existed
  const [consent, setConsent] = useState(false)
  const [v, setV] = useState(() => toForm(user))
  const [msg, setMsg] = useState(null)   // { ok, text }
  const [busy, setBusy] = useState(false)
  const [suggested, setSuggested] = useState(() => new Set())   // fields filled in from the CV, marked until saved

  const roleOf = (x) => (user.role === 'admin' ? 'admin' : roleFor(x.gradYear))
  const form = { ...v, role: roleOf(v) }   // fields follow graduation year
  const edit = (next) => { setV(next); setMsg(null) }

  const problem = () => {
    const n = nameProblem(v.name)
    if (n) return n
    if (user.role === 'admin') return ''
    if (needsConsent && !consent) return 'Please read the privacy notice and tick the box to agree before saving.'
    if (!v.university || (v.university === 'Other' && !(v.otherUniversity || '').trim())) return 'Choose your university.'
    const y = Number(v.gradYear)
    if (v.gradYear !== '' && v.gradYear != null && (!Number.isInteger(y) || y < 1980 || y > 2040)) return 'Enter a graduation year between 1980 and 2040.'
    return ''
  }

  const save = async (e) => {
    e.preventDefault()
    const p = problem()
    if (p) return setMsg({ ok: false, text: p })
    setBusy(true); setMsg(null)
    try {
      const saved = await update({ ...payloadFor(v, roleOf(v)), ...(needsConsent && consent ? { consent: true } : {}) })
      setV(toForm(saved)); setSuggested(new Set())
      setMsg({ ok: true, text: saved.role !== user.role ? `Profile saved. You are now listed as ${saved.role === 'alumnus' ? 'an alumnus' : 'a student'}.` : 'Profile saved.' })
    } catch (x) {
      setMsg({ ok: false, text: `Your changes were not saved. ${x.message || 'Please try again.'}` })
    } finally { setBusy(false) }
  }

  const fillFromCv = (s) => {
    const { next, keys } = applySuggestions(v, s, roleOf)
    edit(next); setSuggested(new Set(keys))
    return keys.length
  }

  return (
    <>
      <PageTitle title="My profile" sub="Your details drive your matches and what others see in the directory." />
      <form onSubmit={save} noValidate className="max-w-xl space-y-6">
        {user.role !== 'admin' && <CvFill onSuggest={fillFromCv} />}
        <div className="flex items-center gap-3"><Avatar name={v.name || '?'} size={56} /><div className="min-w-0 break-words text-sm text-muted">{user.email} · {user.role}</div></div>
        <Field label="Full name"><input className={input} autoComplete="name" maxLength={NAME_MAX + 20} value={v.name || ''} onChange={(e) => edit({ ...v, name: e.target.value })} /></Field>
        <Field label={<>About you and your goals (used to find better matches){suggested.has('bio') && <Suggested />}</>}><textarea rows={3} maxLength={1000} className={input} value={v.bio || ''} onChange={(e) => edit({ ...v, bio: e.target.value })} /></Field>
        {user.role !== 'admin' && (
          <>
            <ProfileFields v={form} set={edit} section="academic" suggested={suggested} />
            <ProfileFields v={form} set={edit} section="career" suggested={suggested} />
            <VisibilityPicker value={v.visibility || 'limited'} onChange={(x) => edit({ ...v, visibility: x })} />
            {needsConsent && <><PrivacySummary /><ConsentBox checked={consent} onChange={setConsent} /></>}
          </>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button className={btn} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          {msg && (msg.ok
            ? <span role="status" className="text-sm font-medium text-navy">{msg.text}</span>
            : <p role="alert" className="w-full border-l-4 border-gold bg-white p-3 text-sm">{msg.text}</p>)}
        </div>
      </form>
      <YourData />
    </>
  )
}

// Delete your account and its data (Data Protection Act, 2019).
function YourData() {
  const { deleteAccount } = useAuth()
  const [msg, setMsg] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    setBusy(true); setMsg(null)
    try { await deleteAccount() }   // on success the app leaves for the sign-in page
    catch (x) { setMsg({ ok: false, text: x.message }); setBusy(false) }
  }

  return (
    <section aria-labelledby="your-data" className="mt-10 max-w-xl space-y-3 border-t border-ice-deep pt-6">
      <h2 id="your-data" className="text-xl font-bold">Your data</h2>
      <p className="text-sm text-muted">You can delete your account and the data stored about you at any time. <a href="/privacy" className="underline">Privacy notice</a></p>
      {!confirming ? (
        <div><button type="button" className={btnLine} onClick={() => { setConfirming(true); setTyped(''); setMsg(null) }}>Delete my account</button></div>
      ) : (
        <div className="space-y-2 border-l-4 border-gold bg-white p-4 text-sm" role="group" aria-labelledby="delete-title">
          <p id="delete-title" className="font-semibold">Delete your account permanently?</p>
          <p>This deletes your profile, your sign-in account, your requests, mentorships, messages, sessions, ratings, reviews and forum posts. It cannot be undone.</p>
          <Field label="Type DELETE to confirm"><input className={input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={typed !== 'DELETE' || busy} onClick={remove}>{busy ? 'Deleting…' : 'Delete my account'}</button>
            <button type="button" className={btnLine} disabled={busy} onClick={() => setConfirming(false)}>Keep my account</button>
          </div>
        </div>
      )}
      {msg && (msg.ok ? <p role="status" className="text-sm">{msg.text}</p> : <p role="alert" className="border-l-4 border-gold bg-white p-3 text-sm">{msg.text}</p>)}
    </section>
  )
}
