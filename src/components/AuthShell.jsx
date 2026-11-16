import { ClerkFailed } from '@clerk/react'
import { PrivacyFooter } from './Privacy'

// Clerk's own look, in the app's colours, sized to fit a 360px phone (Clerk's card is at most 100vw - 2.5rem wide).
export const clerkAppearance = {
  variables: { colorPrimary: '#0b1f3a' },
  elements: { rootBox: 'w-full flex justify-center' },
}

// Shown if Clerk cannot load (no internet, blocked script, wrong key).
export function ClerkLoadError() {
  return (
    <ClerkFailed>
      <p role="alert" className="mx-auto w-full max-w-md border-l-4 border-gold bg-white p-3 text-sm">
        Sign-in could not load. Check your internet connection and refresh the page. If it keeps happening, tell the person who shared this link.
      </p>
    </ClerkFailed>
  )
}

// Abstract "graduates connecting" picture for the welcome panel: a mortarboard joined to a network of people.
// Inline SVG in the app palette (no external images); decorative, so hidden from screen readers.
function WelcomeArt() {
  const nodes = [[40, 60, 7], [95, 28, 5], [70, 150, 6], [250, 40, 6], [285, 120, 8], [225, 170, 5], [30, 120, 4], [300, 70, 4]]
  return (
    <svg viewBox="0 0 330 200" className="mt-10 hidden h-auto max-h-[30vh] w-full max-w-sm md:block" aria-hidden="true" focusable="false">
      <g stroke="#cfe2f3" strokeOpacity="0.3" strokeWidth="1.5">
        {nodes.map(([x, y], i) => <line key={`c${i}`} x1="165" y1="100" x2={x} y2={y} />)}
        <line x1="40" y1="60" x2="95" y2="28" /><line x1="40" y1="60" x2="30" y2="120" /><line x1="30" y1="120" x2="70" y2="150" />
        <line x1="250" y1="40" x2="300" y2="70" /><line x1="300" y1="70" x2="285" y2="120" /><line x1="285" y1="120" x2="225" y2="170" />
      </g>
      {nodes.map(([x, y, r], i) => (
        <circle key={`n${i}`} cx={x} cy={y} r={r} fill={i % 3 === 0 ? '#f5a623' : '#17345c'} stroke="#cfe2f3" strokeOpacity="0.6" strokeWidth="1.5" />
      ))}
      <circle cx="165" cy="100" r="46" fill="#17345c" stroke="#f5a623" strokeOpacity="0.5" strokeWidth="2" />
      {/* mortarboard */}
      <path d="M140 102 v14 c0 9 50 9 50 0 v-14 l-25 10 z" fill="#0b1f3a" stroke="#cfe2f3" strokeOpacity="0.5" strokeWidth="1.5" />
      <polygon points="165,74 207,92 165,110 123,92" fill="#f5a623" />
      <path d="M165 92 L196 101 V122" fill="none" stroke="#f5a623" strokeWidth="2" strokeLinecap="round" />
      <circle cx="196" cy="125" r="3.5" fill="#f5a623" />
    </svg>
  )
}

// Sign-in and sign-up pages: compact intro on phones (the form is visible without scrolling), two columns on wider screens.
// From md up the welcome panel is exactly one screen tall (100dvh) and stays in place, with its content centred, so it is
// fully visible on laptop screens even when the form column is taller than the window.
export default function AuthShell({ title, intro, children, help }) {
  return (
    <div className="grid min-h-screen bg-ice md:grid-cols-2">
      <section className="bg-navy px-4 py-6 md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:justify-center md:overflow-hidden md:px-12 md:py-10 lg:px-16">
        <h1 className="max-w-md break-words font-display text-2xl leading-tight text-white sm:text-3xl md:text-4xl lg:text-5xl">{title}</h1>
        <p className="mt-2 hidden max-w-md text-ice-deep md:mt-4 md:block">{intro}</p>
        <WelcomeArt />
      </section>
      <section className="flex min-w-0 flex-col items-center gap-4 px-4 py-6 md:min-h-dvh md:justify-center md:p-8">
        <ClerkLoadError />
        {children}
        {help && <div className="w-full max-w-[25rem] text-sm text-muted">{help}</div>}
        <PrivacyFooter />
      </section>
    </div>
  )
}
