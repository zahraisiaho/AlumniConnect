import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth as useClerkAuth } from '@clerk/react'
import { api } from '../lib/api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

// Clerk answers "who is signed in". Our API answers "what is their profile and role".
//
// status is worked out on every render, never left over from an earlier state:
//   'loading'        Clerk is loading, the profile for THIS Clerk user has not arrived yet, or the user is signing out
//   'signed-out'     nobody is signed in
//   'needs-profile'  signed in, but the profile form has not been completed
//   'ready'          signed in with a profile (user is set)
//   'error'          signed in, but the profile could not be loaded (error says why; retry() tries again)
// The profile is stored together with the Clerk user id it belongs to, so after a sign-in, sign-out or account switch
// the old answer is never shown for the new user: the status is 'loading' until the new answer arrives.
const EMPTY = { key: null, user: null, needsProfile: false, error: '' }

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, userId, getToken, signOut } = useClerkAuth()
  const [loaded, setLoaded] = useState(EMPTY)
  const [leaving, setLeaving] = useState(false)
  const [attempt, setAttempt] = useState(0)
  api.setTokenGetter(getToken)

  const key = !isLoaded ? null : isSignedIn ? `user:${userId}` : 'signed-out'

  useEffect(() => {
    if (!key || key === 'signed-out') return undefined
    let live = true
    api.me()
      .then((r) => { if (live) setLoaded({ key, user: r.user || null, needsProfile: !!r.needsProfile, error: '' }) })
      .catch((e) => { if (live) setLoaded({ key, user: null, needsProfile: false, error: e.message }) })
    return () => { live = false }
  }, [key, attempt])

  const mine = loaded.key === key ? loaded : EMPTY
  const status = leaving || !key ? 'loading'
    : key === 'signed-out' ? 'signed-out'
    : loaded.key !== key ? 'loading'
    : mine.error ? 'error'
    : mine.needsProfile ? 'needs-profile' : 'ready'

  const retry = useCallback(() => { setLoaded(EMPTY); setAttempt((n) => n + 1) }, [])

  const value = {
    status,
    user: status === 'ready' ? mine.user : null,
    error: status === 'error' ? mine.error : '',
    signedIn: !!isSignedIn,
    // Where a signed-in person belongs right now.
    home: status === 'needs-profile' ? '/complete-profile' : status === 'signed-out' ? '/login' : '/directory',
    retry,
    createProfile: async (data) => { const u = await api.createProfile(data); setLoaded({ key, user: u, needsProfile: false, error: '' }); return u },
    update: async (patch) => { const u = await api.update(patch); setLoaded((l) => (l.key === key ? { ...l, user: u } : l)); return u },
    // Deletes the profile and the sign-in account on the server, then leaves for the sign-in page.
    deleteAccount: async () => {
      await api.deleteMe()
      setLeaving(true)
      try { await signOut({ redirectUrl: '/login?deleted=1' }) } catch { window.location.assign('/login?deleted=1') }
    },
    // Clerk clears the session and loads /login. Until then the app shows the loading screen, not a half-signed-out page.
    logout: async () => {
      setLeaving(true)
      try { await signOut({ redirectUrl: '/login' }) } catch (e) { setLeaving(false); throw e }
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
