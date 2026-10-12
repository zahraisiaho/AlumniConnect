import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { forumCategories } from '../data/options'
import { PageTitle, Row, Field, input, btn, btnLine } from '../components/ui'

const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export default function Forum() {
  const { user } = useAuth()
  const [cat, setCat] = useState('')
  const [posts, setPosts] = useState([])
  const [open, setOpen] = useState(null)
  const [reply, setReply] = useState('')
  const [draft, setDraft] = useState({ title: '', body: '', category: forumCategories[0] })

  const load = () => api.posts(cat).then(setPosts)
  useEffect(() => { load() }, [cat]) // eslint-disable-line

  const publish = async (e) => {
    e.preventDefault()
    if (!draft.title.trim() || !draft.body.trim()) return
    await api.createPost(user.id, draft); setDraft({ ...draft, title: '', body: '' }); load()
  }
  const send = async (id) => { if (!reply.trim()) return; await api.addReply(id, user.id, reply); setReply(''); load() }

  return (
    <>
      <PageTitle title="Forum" sub="Ask questions and share what you have learned." />
      <form onSubmit={publish} className="mb-6 space-y-3 border-l-4 border-navy bg-white p-4">
        <Field label="Title"><input className={input} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
        <Field label="Message"><textarea rows={3} className={input} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></Field>
        <div className="flex items-end gap-3">
          <Field label="Category"><select className={input} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{forumCategories.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <button className={btn}>Publish post</button>
        </div>
      </form>
      <div className="mb-4 flex flex-wrap gap-2">
        {['', ...forumCategories].map((c) => (
          <button key={c || 'all'} onClick={() => setCat(c)} aria-pressed={cat === c} className={`rounded-full border px-3 py-1 text-xs ${cat === c ? 'border-navy bg-navy text-white' : 'border-ice-deep bg-white'}`}>{c || 'All topics'}</button>
        ))}
      </div>
      <div className="space-y-2">
        {posts.map((p) => (
          <Row key={p.id} accent={p.category === 'Jobs & internships' ? 'border-navy-soft' : 'border-gold'}>
            <div className="text-xs text-muted">{p.category}, {p.author}, {when(p.createdAt)}</div>
            <h3 className="mt-1 text-lg font-bold">{p.title}</h3>
            <p className="mt-1 text-sm">{p.body}</p>
            <button className={`${btnLine} mt-3`} onClick={() => { setOpen(open === p.id ? null : p.id); setReply('') }}>{open === p.id ? 'Hide replies' : `Replies (${p.replies.length})`}</button>
            {open === p.id && (
              <div className="mt-3 space-y-2 border-t border-ice-deep pt-3">
                {p.replies.map((r) => <p key={r.id} className="text-sm"><span className="font-semibold">{r.author}:</span> {r.body}</p>)}
                <div className="flex gap-2">
                  <input className={input} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply" aria-label="Reply" />
                  <button className={btn} onClick={() => send(p.id)}>Reply</button>
                </div>
              </div>
            )}
          </Row>
        ))}
        {!posts.length && <p className="text-sm text-muted">No posts in this topic yet. Start the conversation above.</p>}
      </div>
    </>
  )
}
