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

function Guard({ children }) {
  const { signedIn, needsProfile, ready, error } = useAuth()
  if (!ready) return <p className="p-8 text-sm text-muted">Loading…</p>
  if (!signedIn) return <Navigate to="/login" replace />
  if (error) return <p role="alert" className="m-8 border-l-4 border-gold bg-white p-4 text-sm">{error}</p>
  if (needsProfile) return <Navigate to="/complete-profile" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login/*" element={<Login />} />
          <Route path="/register/*" element={<Register />} />
          <Route path="/complete-profile" element={<CompleteProfile />} />
          <Route element={<Guard><Layout /></Guard>}>
            <Route path="/directory" element={<Directory />} />
            <Route path="/mentorship" element={<Mentorship />} />
            <Route path="/forum" element={<Forum />} />
            <Route path="/updates" element={<Updates />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
          <Route path="*" element={<Navigate to="/directory" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
