import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageTitle, Avatar, Field, input, btn } from '../components/ui'
import ProfileFields, { toForm, fromForm } from '../components/ProfileFields'

export default function Profile() {
  const { user, update } = useAuth()
  const [v, setV] = useState(() => toForm(user))
  const [msg, setMsg] = useState('')

  const save = async (e) => {
    e.preventDefault()
    const { id, email, password, role, ...patch } = fromForm(v)
    await update(patch); setMsg('Profile saved.')
  }

  return (
    <>
      <PageTitle title="My profile" sub="Your details drive your matches and what others see in the directory." />
      <form onSubmit={save} className="max-w-xl space-y-6">
        <div className="flex items-center gap-3"><Avatar name={v.name} size={56} /><div className="text-sm text-muted">{user.email} · {user.role}</div></div>
        <Field label="Full name"><input className={input} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="About you"><textarea rows={3} className={input} value={v.bio || ''} onChange={(e) => setV({ ...v, bio: e.target.value })} /></Field>
        {user.role !== 'admin' && (
          <>
            <ProfileFields v={v} set={setV} section="academic" />
            <ProfileFields v={v} set={setV} section="career" />
          </>
        )}
        <div className="flex items-center gap-3"><button className={btn}>Save changes</button>{msg && <span role="status" className="text-sm">{msg}</span>}</div>
      </form>
    </>
  )
}
