import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth as useClerkAuth } from '@clerk/react'
import { api } from '../lib/api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

// Clerk answers "who is signed in". Our API answers "what is their profile and role".
export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth()
  const [user, setUser] = useState(null)
  const [needsProfile, setNeedsProfile] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  api.setTokenGetter(getToken)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) { setUser(null); setNeedsProfile(false); setError(''); setReady(true); return }
    let live = true
    setReady(false)
    api.me()
      .then((r) => { if (live) { setUser(r.user || null); setNeedsProfile(!!r.needsProfile); setError('') } })
      .catch((e) => { if (live) setError(e.message) })
      .finally(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [isLoaded, isSignedIn])

  const value = {
    user, needsProfile, ready, error, signedIn: !!isSignedIn,
    createProfile: async (data) => { const u = await api.createProfile(data); setUser(u); setNeedsProfile(false); return u },
    update: async (patch) => setUser(await api.update(user.id, patch)),
    logout: async () => { await signOut(); setUser(null) },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
