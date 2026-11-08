import { useState } from 'react'
import { universities, fields, industries, skills, interests, availability } from '../data/options'
import { Field, Chips, Suggested, input, btnLine } from './ui'

// Listed skills as chips, plus a box for typing in one that is not listed.
// Not wrapped in Field: a <label> would pass clicks on its text to the first chip.
function SkillPicker({ value, onChange, suggested }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const add = () => {
    const name = text.trim().replace(/\s+/g, ' ')
    if (!name) return
    if (name.length > 40) return setNote('Keep each skill to 40 characters or fewer.')
    // Reuse the listed spelling when the typed skill matches one, so people match on the same name.
    const known = [...skills, ...value].find((s) => s.toLowerCase() === name.toLowerCase()) || name
    if (!value.includes(known)) onChange([...value, known])
    setText(''); setNote('')
  }
  return (
    <div role="group" aria-labelledby="skills-label">
      <span id="skills-label" className="mb-1 block text-sm font-medium">Skills{suggested && <Suggested />}</span>
      <Chips options={skills} value={value} onChange={onChange} />
      <div className="mt-2 flex gap-2">
        <input className={input} value={text} placeholder="Skill not listed? Type it here" aria-label="Add a skill that is not listed" maxLength={60}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        <button type="button" className={btnLine} onClick={add}>Add</button>
      </div>
      {note && <p role="alert" className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  )
}

export const toForm = (u) => {
  const known = !u.university || universities.includes(u.university)
  return { ...u, university: known ? u.university : 'Other', otherUniversity: known ? '' : u.university }
}
export const fromForm = (v) => {
  const { otherUniversity, ...rest } = v
  return { ...rest, university: v.university === 'Other' ? (otherUniversity || '').trim() : v.university, gradYear: Number(v.gradYear) || '' }
}

// suggested: names of fields filled in from the CV, marked until the person saves.
export default function ProfileFields({ v, set, section, suggested }) {
  const on = (k) => (e) => set({ ...v, [k]: e.target.value })
  const mark = (key, text) => (suggested?.has(key) ? <>{text}<Suggested /></> : text)
  const isAlumnus = v.role === 'alumnus'

  if (section === 'academic') {
    return (
      <div className="space-y-4">
        <Field label={mark('university', 'University')}>
          <select className={input} value={v.university || ''} onChange={on('university')}>
            <option value="">Select your university</option>
            {universities.map((u) => <option key={u}>{u}</option>)}
            <option value="Other">My university is not listed</option>
          </select>
        </Field>
        {v.university === 'Other' && (
          <Field label={mark('university', 'University name')}>
            <input className={input} value={v.otherUniversity || ''} onChange={on('otherUniversity')} />
          </Field>
        )}
        <Field label={mark('course', 'Course or programme')}>
          <input className={input} value={v.course || ''} onChange={on('course')} placeholder="e.g. BSc Computer Science" />
        </Field>
        <Field label={mark('fieldOfStudy', 'Field of study')}>
          <select className={input} value={v.fieldOfStudy || ''} onChange={on('fieldOfStudy')}>
            <option value="">Select a field</option>
            {fields.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <Field label={mark('gradYear', 'Graduation year (or the year you expect to graduate)')}>
          <input className={input} type="number" min="1980" max="2040" value={v.gradYear || ''} onChange={on('gradYear')} />
        </Field>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isAlumnus && (
        <>
          <Field label={mark('jobTitle', 'Job title')}><input className={input} value={v.jobTitle || ''} onChange={on('jobTitle')} /></Field>
          <Field label={mark('company', 'Company')}><input className={input} value={v.company || ''} onChange={on('company')} /></Field>
        </>
      )}
      <Field label={mark('industry', isAlumnus ? 'Your industry' : 'Industry you want to work in')}>
        <select className={input} value={v.industry || ''} onChange={on('industry')}>
          <option value="">Select an industry</option>
          {industries.map((i) => <option key={i}>{i}</option>)}
        </select>
      </Field>
      <SkillPicker value={v.skills || []} onChange={(x) => set({ ...v, skills: x })} suggested={suggested?.has('skills')} />
      <Field label={isAlumnus ? 'Topics you can mentor on' : 'What you want help with'}>
        <Chips options={interests} value={v.interests} onChange={(x) => set({ ...v, interests: x })} />
      </Field>
      <Field label="Availability">
        <select className={input} value={v.availability || ''} onChange={on('availability')}>
          <option value="">Select availability</option>
          {availability.map((a) => <option key={a}>{a}</option>)}
        </select>
      </Field>
      {isAlumnus && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!v.mentor} onChange={(e) => set({ ...v, mentor: e.target.checked })} />
          I am open to mentoring students and recent graduates
        </label>
      )}
    </div>
  )
}
