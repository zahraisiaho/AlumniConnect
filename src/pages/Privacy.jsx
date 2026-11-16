import { Link } from 'react-router-dom'
import { PRIVACY_NOTICE_VERSION } from '../components/Privacy'

// Public page (no sign-in needed). Plain language, following the Kenya Data Protection Act, 2019.
export default function Privacy() {
  const H = ({ children }) => <h2 className="mt-6 text-lg font-semibold">{children}</h2>
  return (
    <div className="min-h-screen bg-ice px-4 py-8">
      <article className="mx-auto max-w-2xl space-y-2 text-sm leading-relaxed">
        <Link to="/" className="text-sm underline">Back to AlumniConnect</Link>
        <h1 className="mt-2 text-3xl font-bold">Privacy notice</h1>
        <p className="text-muted">Version {PRIVACY_NOTICE_VERSION}. This notice explains what AlumniConnect collects, why, who can see it and the rights you have under the Kenya Data Protection Act, 2019.</p>

        <H>What we collect</H>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Sign-in details:</strong> your email address and sign-in method, handled by our sign-in provider, Clerk. We never see your password.</li>
          <li><strong>Profile:</strong> name, university, course, field of study, graduation year, industry, job title and company (alumni only), skills, mentorship interests, availability, whether you are open to mentoring, and your bio.</li>
          <li><strong>Activity:</strong> mentorship requests, messages and session plans with your mentorship partner, reviews of ended mentorships, forum posts and replies.</li>
          <li><strong>Ratings:</strong> if you take part in Improve matching, whether each suggested mentor seemed helpful.</li>
          <li><strong>Derived data:</strong> a list of numbers computed from your bio, used to compare goals. It cannot be turned back into your text.</li>
        </ul>
        <p>We do not collect anything else. Your graduation year is used to decide whether you join as a student or an alumnus.</p>

        <H>Your CV</H>
        <p>If you upload a CV, it is read once to suggest answers for your profile. The file and its text are not stored. Nothing is saved until you save your profile yourself.</p>

        <H>Why we use it</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>To suggest mentors who fit your field, skills, interests and goals.</li>
          <li>To run mentorships: requests, messages, sessions and reviews.</li>
          <li>To improve matching. Ratings are exported for model training as ids and numbers only: no names, emails or text.</li>
        </ul>
        <p>We use your information because you agreed to it when you created your profile. You can withdraw that agreement at any time by deleting your account.</p>

        <H>Who can see it</H>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Other members</strong> see what your profile visibility allows. <em>Visible to members:</em> your full profile. <em>Limited</em> (the default): your first name, field of study, university and skills. <em>Hidden:</em> you are not listed in the directory and not suggested as a mentor.</li>
          <li><strong>Your mentorship partner</strong> sees your full profile while the mentorship is active, and your first name afterwards. Only the two of you can read your messages.</li>
          <li><strong>Administrators</strong> can see accounts to run and protect the service. They see counts of messages and reviews, never their text.</li>
          <li><strong>Your email address is never shown to other users.</strong></li>
          <li>We do not sell your information or share it for advertising.</li>
        </ul>

        <H>Service providers and storage</H>
        <p>Sign-in is provided by Clerk, which may process your sign-in details outside Kenya under its own safeguards. Your profile and activity are stored in the AlumniConnect database. The text comparison model runs on our own server, so your bio is not sent to another company for matching.</p>

        <H>How long we keep it</H>
        <p>We keep your information while you have an account. When you delete your account, your profile, sign-in account, requests, mentorships, messages, sessions, ratings, reviews, forum posts and replies are deleted.</p>

        <H>Your rights</H>
        <p>Under the Data Protection Act, 2019 you have the right to be informed, to access your data, to correct it, to object to its use, and to have it deleted. In AlumniConnect you can:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>correct your details and change your visibility in <strong>My profile</strong>;</li>
          <li>download everything we store about you with <strong>Download my data</strong> (a JSON file);</li>
          <li>delete your account and its data with <strong>Delete my account</strong>.</li>
        </ul>
        <p>For anything else, contact the AlumniConnect administrators. If you are not satisfied with our answer, you can complain to the Office of the Data Protection Commissioner (ODPC), Kenya.</p>
      </article>
    </div>
  )
}
