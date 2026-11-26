import { SignIn } from '@clerk/react'
import { useSearchParams } from 'react-router-dom'
import AuthShell, { clerkAppearance } from '../components/AuthShell'

export default function Login() {
  const [params] = useSearchParams()
  return (
    <AuthShell
      title="Welcome to AlumniConnect."
      intro="Whether you are a student looking for direction or a graduate ready to share what you have learned, this is where universities meet. Create your profile, find a mentor or mentee from any university, join the conversation and stay up to date with news from your institution."
      help={<p><strong className="text-navy">Forgot your password?</strong> Enter your email address and press Continue, then choose <em>Forgot password?</em> We will email you a code to set a new one.</p>}>
      {params.get('deleted') && <p role="status" className="w-full max-w-[25rem] border-l-4 border-navy bg-white p-3 text-sm">Your account and your data have been deleted.</p>}
      {/* After signing in, "/" sends the person straight to their page (directory or complete profile).
          oidcPrompt="select_account": Google always shows its account chooser, so after signing out you can pick another account. */}
      <SignIn routing="path" path="/login" signUpUrl="/register" fallbackRedirectUrl="/" oidcPrompt="select_account" appearance={clerkAppearance} />
    </AuthShell>
  )
}
