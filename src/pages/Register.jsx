import { SignUp } from '@clerk/react'

export default function Register() {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <SignUp routing="path" path="/register" signInUrl="/login" appearance={{ variables: { colorPrimary: '#0b1f3a' } }} />
    </div>
  )
}
