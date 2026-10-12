import { universities, fields, industries, skills, interests, availability } from '../data/options'
import { Field, Chips, input } from './ui'

export const toForm = (u) => {
  const known = !u.university || universities.includes(u.university)
  return { ...u, university: known ? u.university : 'Other', otherUniversity: known ? '' : u.university }
}
export const fromForm = (v) => {
  const { otherUniversity, ...rest } = v
  return { ...rest, university: v.university === 'Other' ? (otherUniversity || '').trim() : v.university, gradYear: Number(v.gradYear) || '' }
}

export default function ProfileFields({ v, set, section }) {
  const on = (k) => (e) => set({ ...v, [k]: e.target.value })
  const isAlumnus = v.role === 'alumnus'

  if (section === 'academic') {
    return (
      <div className="space-y-4">
        <Field label="University">
          <select className={input} value={v.university || ''} onChange={on('university')}>
            <option value="">Select your university</option>
            {universities.map((u) => <option key={u}>{u}</option>)}
            <option value="Other">My university is not listed</option>
          </select>
        </Field>
        {v.university === 'Other' && (
          <Field label="University name">
            <input className={input} value={v.otherUniversity || ''} onChange={on('otherUniversity')} />
          </Field>
        )}
        <Field label="Course or programme">
          <input className={input} value={v.course || ''} onChange={on('course')} placeholder="e.g. BSc Computer Science" />
        </Field>
        <Field label="Field of study">
          <select className={input} value={v.fieldOfStudy || ''} onChange={on('fieldOfStudy')}>
            <option value="">Select a field</option>
            {fields.map((f) => <option key={f}>{f}</option>)}
          </select>
        </Field>
        <Field label={isAlumnus ? 'Graduation year' : 'Expected graduation year'}>
          <input className={input} type="number" min="1980" max="2040" value={v.gradYear || ''} onChange={on('gradYear')} />
        </Field>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isAlumnus && (
        <>
          <Field label="Job title"><input className={input} value={v.jobTitle || ''} onChange={on('jobTitle')} /></Field>
          <Field label="Company"><input className={input} value={v.company || ''} onChange={on('company')} /></Field>
        </>
      )}
      <Field label={isAlumnus ? 'Your industry' : 'Industry you want to work in'}>
        <select className={input} value={v.industry || ''} onChange={on('industry')}>
          <option value="">Select an industry</option>
          {industries.map((i) => <option key={i}>{i}</option>)}
        </select>
      </Field>
      <Field label="Skills"><Chips options={skills} value={v.skills} onChange={(x) => set({ ...v, skills: x })} /></Field>
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
