import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Directory from './pages/Directory'
import Mentorship from './pages/Mentorship'
import Forum from './pages/Forum'
import Updates from './pages/Updates'
import Profile from './pages/Profile'

function Guard({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return null
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<Guard><Layout /></Guard>}>
            <Route path="/directory" element={<Directory />} />
            <Route path="/mentorship" element={<Mentorship />} />
            <Route path="/forum" element={<Forum />} />
            <Route path="/updates" element={<Updates />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route path="*" element={<Navigate to="/directory" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
