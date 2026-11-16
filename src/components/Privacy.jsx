import { Link } from 'react-router-dom'

// Must match PRIVACY_NOTICE_VERSION in backend/src/privacy.js. Change both when the notice changes.
export const PRIVACY_NOTICE_VERSION = '2026-11-09'

export const VISIBILITY_OPTIONS = [
  { value: 'members', label: 'Visible to members', help: 'Your full profile appears in the directory (never your email address).' },
  { value: 'limited', label: 'Limited (recommended)', help: 'Only your first name, field of study, university and skills are shown.' },
  { value: 'hidden', label: 'Hidden', help: 'You are not listed in the directory and not suggested as a mentor.' },
]

// "Who can see my profile". Whatever is chosen, people in an active mentorship with you see your full profile.
export function VisibilityPicker({ value, onChange }) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Profile visibility</legend>
      {VISIBILITY_OPTIONS.map((o) => (
        <label key={o.value} className={`flex cursor-pointer gap-3 border p-3 text-sm ${value === o.value ? 'border-navy bg-white' : 'border-ice-deep bg-white/60'}`}>
          <input type="radio" name="visibility" value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1" />
          <span><span className="font-semibold">{o.label}</span><span className="block text-muted">{o.help}</span></span>
        </label>
      ))}
      <p className="text-xs text-muted">People in an active mentorship with you can always see your full profile. You can change this at any time in My profile.</p>
    </fieldset>
  )
}

// The short notice shown before someone saves their profile for the first time.
export function PrivacySummary() {
  return (
    <div className="space-y-2 border border-ice-deep bg-white p-4 text-sm">
      <h2 className="font-semibold">How we use your information</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>What we collect:</strong> your profile (name, university, course, field of study, graduation year, industry, job title and company for alumni, skills, interests, availability), your bio, and the ratings you give mentors.</li>
        <li><strong>Why:</strong> to suggest mentors who fit your goals, to run mentorships, and to improve matching. Ratings are used for training as ids and numbers only.</li>
        <li><strong>Who sees it:</strong> other members see what your visibility setting allows; your mentorship partner sees your full profile; administrators can see accounts to run the service.</li>
        <li><strong>Never shown:</strong> your email address is never shown to other users. If you upload a CV, it is read to suggest answers and the file is not stored.</li>
        <li><strong>Your choices:</strong> change your visibility, download your data or delete your account at any time in My profile.</li>
      </ul>
      <p>Read the full <Link to="/privacy" target="_blank" className="font-semibold underline">privacy notice</Link> (Kenya Data Protection Act, 2019).</p>
    </div>
  )
}

export function ConsentBox({ checked, onChange }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>I have read the privacy notice and agree that AlumniConnect uses my information as described.</span>
    </label>
  )
}

export function PrivacyFooter() {
  return (
    <footer className="px-4 py-6 text-center text-xs text-muted">
      <Link to="/privacy" className="underline">Privacy notice</Link> · Kenya Data Protection Act, 2019
    </footer>
  )
}
