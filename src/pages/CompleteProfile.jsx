import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/react'
import { useAuth } from '../context/AuthContext'
import { Field, Suggested, input, btn, btnLine } from '../components/ui'
import ProfileFields, { fromForm } from '../components/ProfileFields'
import { roleFor } from '../lib/role'
import CvFill, { applySuggestions } from '../components/CvFill'

const steps = ['About you', 'Career and matching']

export default function CompleteProfile() {
  const { createProfile, user, signedIn, ready } = useAuth()
  const { user: clerkUser } = useUser()
  const go = useNavigate()
  const [step, setStep] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggested, setSuggested] = useState(() => new Set())   // fields filled in from the CV
  const [v, setV] = useState({ name: '', university: '', otherUniversity: '', course: '', fieldOfStudy: '', gradYear: '', industry: '', jobTitle: '', company: '', skills: [], interests: [], availability: '', mentor: true, bio: '' })

  useEffect(() => {
    if (clerkUser) setV((x) => (x.name ? x : { ...x, name: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') }))
  }, [clerkUser])

  if (!ready) return null
  if (!signedIn) return <Navigate to="/login" replace />
  if (user) return <Navigate to="/directory" replace />

  const role = roleFor(v.gradYear)          // inferred from graduation year, never asked
  const form = { ...v, role }
  const year = Number(v.gradYear)

  const problem = () => {
    if (step !== 0) return ''
    if (!v.name.trim()) return 'Enter your name.'
    if (!v.university || (v.university === 'Other' && !v.otherUniversity.trim())) return 'Choose your university.'
    if (!v.fieldOfStudy) return 'Choose your field of study.'
    if (!Number.isInteger(year) || year < 1980 || year > 2040) return 'Enter your graduation year, or the year you expect to graduate.'
    return ''
  }
  const fillFromCv = (s) => {
    const { next: filled, keys } = applySuggestions(v, s, (x) => roleFor(x.gradYear))
    setV(filled); setSuggested(new Set(keys))
    return keys.length
  }
  const next = () => { const p = problem(); setErr(p); if (!p) setStep(1) }
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try {
      const { role: ignored, ...payload } = fromForm(v)   // the server decides the role from the graduation year
      await createProfile(payload); go('/directory')
    } catch (x) { setErr(x.message); setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-lg p-6 md:py-12">
      <h1 className="text-3xl font-bold">Complete your profile</h1>
      <p className="mt-1 text-sm text-muted">Step {step + 1} of {steps.length}: {steps[step]}</p>
      <div className="mt-2 flex gap-1" aria-hidden>{steps.map((s, i) => <div key={s} className={`h-1 flex-1 ${i <= step ? 'bg-gold' : 'bg-ice-deep'}`} />)}</div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {step === 0 && (
          <>
            <CvFill onSuggest={fillFromCv} />
            <Field label="Full name"><input className={input} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <ProfileFields v={form} set={setV} section="academic" suggested={suggested} />
          </>
        )}
        {step === 1 && (
          <>
            <p className="border-l-4 border-gold bg-white p-3 text-sm">
              {role === 'alumnus'
                ? 'You will join as an alumnus, so students can find you and ask you for mentorship.'
                : 'You will join as a student or recent graduate, so you can find mentors.'}
            </p>
            <ProfileFields v={form} set={setV} section="career" suggested={suggested} />
            <Field label={<>{role === 'alumnus' ? 'What can you help mentees with? (a few sentences)' : 'What do you want guidance on? (a few sentences)'}{suggested.has('bio') && <Suggested />}</>}>
              <textarea rows={4} maxLength={1000} className={input} value={v.bio} onChange={(e) => setV({ ...v, bio: e.target.value })} />
            </Field>
          </>
        )}
        {err && <p role="alert" className="border-l-4 border-gold bg-white p-3 text-sm">{err}</p>}
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? <button type="button" className={btnLine} onClick={() => { setErr(''); setStep(0) }}>Back</button> : <span />}
          {step === 0 ? <button type="button" className={btn} onClick={next}>Continue</button> : <button className={btn} disabled={busy}>{busy ? 'Saving…' : 'Finish'}</button>}
        </div>
      </form>
    </div>
  )
}
