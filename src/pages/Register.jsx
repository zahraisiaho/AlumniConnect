import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field, input, btn, btnLine } from '../components/ui'
import ProfileFields, { fromForm } from '../components/ProfileFields'

const steps = ['Account', 'University', 'Career and matching']

export default function Register() {
  const { register } = useAuth()
  const go = useNavigate()
  const [step, setStep] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [v, setV] = useState({ role: 'student', name: '', email: '', password: '', university: '', otherUniversity: '', course: '', fieldOfStudy: '', gradYear: '', industry: '', jobTitle: '', company: '', skills: [], interests: [], availability: '', mentor: true })
  const on = (k) => (e) => setV({ ...v, [k]: e.target.value })

  const problem = () => {
    if (step === 0) {
      if (!v.name.trim() || !v.email.includes('@')) return 'Enter your name and a valid email.'
      if (v.password.length < 6) return 'Use a password of at least 6 characters.'
    }
    if (step === 1) {
      if (!v.university || (v.university === 'Other' && !v.otherUniversity.trim())) return 'Choose your university.'
      if (!v.fieldOfStudy) return 'Choose your field of study.'
    }
    return ''
  }
  const next = () => { const p = problem(); setErr(p); if (!p) setStep(step + 1) }
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await register(fromForm(v)); go('/directory') }
    catch (x) { setErr(x.message); setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-lg p-6 md:py-12">
      <h1 className="text-3xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Step {step + 1} of {steps.length}: {steps[step]}</p>
      <div className="mt-2 flex gap-1" aria-hidden>{steps.map((s, i) => <div key={s} className={`h-1 flex-1 ${i <= step ? 'bg-gold' : 'bg-ice-deep'}`} />)}</div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {step === 0 && (
          <>
            <Field label="I am a">
              <select className={input} value={v.role} onChange={on('role')}>
                <option value="student">Student or recent graduate</option>
                <option value="alumnus">Alumnus</option>
              </select>
            </Field>
            <Field label="Full name"><input className={input} value={v.name} onChange={on('name')} /></Field>
            <Field label="Email"><input className={input} type="email" value={v.email} onChange={on('email')} /></Field>
            <Field label="Password"><input className={input} type="password" value={v.password} onChange={on('password')} /></Field>
          </>
        )}
        {step === 1 && <ProfileFields v={v} set={setV} section="academic" />}
        {step === 2 && <ProfileFields v={v} set={setV} section="career" />}
        {err && <p role="alert" className="border-l-4 border-gold bg-white p-3 text-sm">{err}</p>}
        <div className="flex items-center justify-between pt-2">
          {step > 0 ? <button type="button" className={btnLine} onClick={() => { setErr(''); setStep(step - 1) }}>Back</button> : <Link to="/login" className="text-sm underline">Back to sign in</Link>}
          {step < 2 ? <button type="button" className={btn} onClick={next}>Continue</button> : <button className={btn} disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>}
        </div>
      </form>
    </div>
  )
}
