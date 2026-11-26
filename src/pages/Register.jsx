import { SignUp } from '@clerk/react'
import AuthShell, { clerkAppearance } from '../components/AuthShell'

export default function Register() {
  return (
    <AuthShell
      title="Join AlumniConnect."
      intro="Create your account, then tell us about your studies and goals so we can suggest mentors, or mentees, from any university."
      help={<p>After you confirm your email you will fill in your profile (you can upload your CV to do it faster).</p>}>
      {/* oidcPrompt="select_account": Google always shows its account chooser instead of reusing the last account. */}
      <SignUp routing="path" path="/register" signInUrl="/login" fallbackRedirectUrl="/" oidcPrompt="select_account" appearance={clerkAppearance} />
    </AuthShell>
  )
}
