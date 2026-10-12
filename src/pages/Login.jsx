import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Field, input, btn } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const go = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await login(email, password); go('/directory') }
    catch (x) { setErr(x.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="flex flex-col justify-end bg-navy p-8 md:p-14">
        <h1 className="max-w-md font-display text-4xl leading-tight text-white md:text-5xl">Welcome to AlumniConnect</h1>
        <p className="mt-4 max-w-md text-ice-deep">Whether you are a student looking for direction or a graduate ready to share what you have learned, this is where universities meet. Create your profile, find a mentor or mentee from any university, join the conversation and stay up to date with news from your institution.</p>
      </section>
      <section className="grid place-items-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-bold">Sign In</h2>
          <Field label="Email"><input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Password"><input className={input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {err && <p role="alert" className="border-l-4 border-gold bg-white p-3 text-sm">{err}</p>}
          <button className={`${btn} w-full`} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="text-sm text-muted">New here? <Link to="/register" className="font-semibold text-navy underline">Create an account</Link></p>
          </form>
      </section>
    </div>
  )
}
