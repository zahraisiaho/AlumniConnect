import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { universities, fields, industries } from '../data/options'
import { btnLine } from './ui'

const MAX_BYTES = 5 * 1024 * 1024

// Puts the CV suggestions into the form. Returns the new form values and the names of the fields that were filled,
// so the page can mark them. Empty suggestions leave the form alone; skills are added to the ones already chosen.
// roleOf(values) says whether job title and company apply (alumni only).
export function applySuggestions(v, s, roleOf) {
  const next = { ...v }
  const keys = []
  const put = (k, val) => { if (val !== '' && val != null) { next[k] = val; keys.push(k) } }
  if (s.university) {
    if (universities.includes(s.university)) { put('university', s.university); next.otherUniversity = '' }
    else { next.university = 'Other'; put('otherUniversity', s.university); keys.push('university') }
  }
  put('course', s.course)
  if (fields.includes(s.fieldOfStudy)) put('fieldOfStudy', s.fieldOfStudy)
  if (s.gradYear) put('gradYear', String(s.gradYear))
  if (industries.includes(s.industry)) put('industry', s.industry)
  put('bio', s.bio)
  const merged = [...new Set([...(v.skills || []), ...(s.skills || [])])]
  if (merged.length > (v.skills || []).length) { next.skills = merged; keys.push('skills') }
  if (roleOf(next) === 'alumnus') { put('jobTitle', s.jobTitle); put('company', s.company) }
  return { next, keys }
}

// One button: it opens the file picker, and choosing a file reads it straight away.
// (The browser's own file input is hidden: with the app's CSS reset its "Choose file" button looked like plain text,
// and the separate "Fill in from CV" button stayed disabled, so pressing it did nothing.)
export default function CvFill({ onSuggest }) {
  const picker = useRef(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')

  const read = async (f) => {
    setErr(''); setDone(''); setName(f.name)
    if (!/\.(pdf|docx)$/i.test(f.name)) return setErr('Please choose a PDF or Word (.docx) file.')
    if (f.size > MAX_BYTES) return setErr('That file is larger than 5 MB. Please upload a smaller file or fill in manually.')
    if (!f.size) return setErr('That file is empty. Please choose another file.')
    setBusy(true)
    try {
      const n = onSuggest(await api.parseCv(f))
      setDone(n ? `We filled in ${n} ${n === 1 ? 'answer' : 'answers'} from your CV. Please check them before saving.` : "We couldn't find answers in this CV; please fill in manually.")
    } catch (x) { setErr(x.message || 'Could not read the CV. Please fill in manually.') }
    finally { setBusy(false) }
  }
  const pick = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''   // so choosing the same file again still works
    if (f) read(f)
  }

  return (
    <section aria-labelledby="cv-title" className="space-y-2 border border-ice-deep bg-white p-4">
      <h2 id="cv-title" className="font-semibold">Upload your CV to fill in your profile</h2>
      <p id="cv-help" className="text-sm text-muted">Your CV is read to suggest answers and is not stored. PDF or Word (.docx), up to 5 MB.</p>
      <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={pick}
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btnLine} disabled={busy} aria-describedby="cv-help" onClick={() => picker.current?.click()}>
          {busy ? 'Reading your CV…' : 'Upload CV'}
        </button>
        {name && <span className="max-w-full truncate text-sm text-muted">{name}</span>}
      </div>
      {err && <p role="alert" className="border-l-4 border-gold p-2 text-sm">{err}</p>}
      {done && <p role="status" className="text-sm">{done}</p>}
    </section>
  )
}
