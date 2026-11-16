import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import CompleteProfile from './pages/CompleteProfile'
import Directory from './pages/Directory'
import Mentorship from './pages/Mentorship'
import Forum from './pages/Forum'
import Updates from './pages/Updates'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Rate from './pages/Rate'
import Mentorships from './pages/Mentorships'
import Privacy from './pages/Privacy'
import { btn, btnLine } from './components/ui'
import { ClerkLoadError } from './components/AuthShell'

// Neutral full-screen loading state: shown until Clerk has loaded AND the profile for the signed-in person has arrived.
export function Splash() {
  const [slow, setSlow] = useState(false)
  useEffect(() => { const t = setTimeout(() => setSlow(true), 15000); return () => clearTimeout(t) }, [])
  return (
    <div data-splash className="grid min-h-screen place-items-center bg-ice px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center text-sm text-muted">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-ice-deep border-t-navy" aria-hidden />
        <span role="status" aria-live="polite">{slow ? 'This is taking longer than usual. Check your connection, or refresh the page.' : 'Loading…'}</span>
        <ClerkLoadError />
      </div>
    </div>
  )
}

function ProfileError() {
  const { error, retry, logout } = useAuth()
  return (
    <div className="grid min-h-screen place-items-center bg-ice px-4">
      <div role="alert" className="w-full max-w-md border-l-4 border-gold bg-white p-4 text-sm">
        <p className="font-semibold">We couldn't load your profile.</p>
        <p className="mt-1">{error}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={btn} onClick={retry}>Try again</button>
          <button className={btnLine} onClick={() => logout().catch(() => {})}>Sign out</button>
        </div>
      </div>
    </div>
  )
}

// Goes to another page, showing the loading screen (not a blank page) for the frame in between.
function Redirect({ to }) {
  return <><Splash /><Navigate to={to} replace /></>
}

// Renders the page only when the person is in the state the page is for ('signed-out', 'needs-profile' or 'ready').
// Otherwise it shows the loading screen, or goes straight to where they belong, in one step.
function Gate({ need, children }) {
  const { status, home } = useAuth()
  if (status === 'loading') return <Splash />
  if (status === 'error' && need !== 'signed-out') return <ProfileError />
  if (status === need) return children
  return <Redirect to={status === 'error' ? '/directory' : home} />
}

// "/" and unknown paths (also where Clerk sends people after signing in or up): straight to the right page.
function Home() {
  const { status, home } = useAuth()
  if (status === 'loading') return <Splash />
  return <Redirect to={status === 'error' ? '/directory' : home} />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login/*" element={<Gate need="signed-out"><Login /></Gate>} />
          <Route path="/register/*" element={<Gate need="signed-out"><Register /></Gate>} />
          <Route path="/complete-profile" element={<Gate need="needs-profile"><CompleteProfile /></Gate>} />
          <Route element={<Gate need="ready"><Layout /></Gate>}>
            <Route path="/directory" element={<Directory />} />
            <Route path="/mentorship" element={<Mentorship />} />
            <Route path="/mentorships" element={<Mentorships />} />
            <Route path="/forum" element={<Forum />} />
            <Route path="/updates" element={<Updates />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/rate" element={<Rate />} />
          </Route>
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
