import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageTitle, Avatar, Field, Suggested, input, btn } from '../components/ui'
import ProfileFields, { toForm, fromForm } from '../components/ProfileFields'
import { roleFor } from '../lib/role'
import CvFill, { applySuggestions } from '../components/CvFill'

export default function Profile() {
  const { user, update } = useAuth()
  const [v, setV] = useState(() => toForm(user))
  const [msg, setMsg] = useState('')
  const [suggested, setSuggested] = useState(() => new Set())   // fields filled in from the CV, marked until saved

  const save = async (e) => {
    e.preventDefault()
    const { id, email, password, role, ...patch } = fromForm(v)
    await update(patch); setSuggested(new Set()); setMsg('Profile saved.')
  }

  const roleOf = (x) => (user.role === 'admin' ? 'admin' : roleFor(x.gradYear))
  const form = { ...v, role: roleOf(v) }   // fields follow graduation year
  const fillFromCv = (s) => {
    const { next, keys } = applySuggestions(v, s, roleOf)
    setV(next); setSuggested(new Set(keys)); setMsg('')
    return keys.length
  }

  return (
    <>
      <PageTitle title="My profile" sub="Your details drive your matches and what others see in the directory." />
      <form onSubmit={save} className="max-w-xl space-y-6">
        {user.role !== 'admin' && <CvFill onSuggest={fillFromCv} />}
        <div className="flex items-center gap-3"><Avatar name={v.name} size={56} /><div className="text-sm text-muted">{user.email} · {user.role}</div></div>
        <Field label="Full name"><input className={input} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={<>About you and your goals (used to find better matches){suggested.has('bio') && <Suggested />}</>}><textarea rows={3} className={input} value={v.bio || ''} onChange={(e) => setV({ ...v, bio: e.target.value })} /></Field>
        {user.role !== 'admin' && (
          <>
            <ProfileFields v={form} set={setV} section="academic" suggested={suggested} />
            <ProfileFields v={form} set={setV} section="career" suggested={suggested} />
          </>
        )}
        <div className="flex items-center gap-3"><button className={btn}>Save changes</button>{msg && <span role="status" className="text-sm">{msg}</span>}</div>
      </form>
    </>
  )
}
