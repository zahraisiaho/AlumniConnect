import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  useEffect(() => { api.me().then(setUser).finally(() => setReady(true)) }, [])
  const value = {
    user, ready,
    login: async (email, password) => setUser(await api.login(email, password)),
    register: async (data) => setUser(await api.register(data)),
    update: async (patch) => setUser(await api.update(user.id, patch)),
    logout: () => { api.logout(); setUser(null) },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
