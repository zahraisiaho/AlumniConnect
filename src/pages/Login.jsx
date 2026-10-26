import { SignIn } from '@clerk/react'

export default function Login() {
  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="flex flex-col justify-end bg-navy p-8 md:p-14">
        <h1 className="max-w-md font-display text-4xl leading-tight text-white md:text-5xl">Welcome to AlumniConnect.</h1>
        <p className="mt-4 max-w-md text-ice-deep">Whether you are a student looking for direction or a graduate ready to share what you have learned, this is where universities meet. Create your profile, find a mentor or mentee from any university, join the conversation and stay up to date with news from your institution.</p>
      </section>
      <section className="grid place-items-center p-8">
        <SignIn routing="path" path="/login" signUpUrl="/register" appearance={{ variables: { colorPrimary: '#0b1f3a' } }} />
      </section>
    </div>
  )
}
