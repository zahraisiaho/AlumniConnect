import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Avatar } from './ui'

const nav = [['/directory', 'Directory'], ['/mentorship', 'Mentorship'], ['/forum', 'Forum'], ['/updates', 'Updates'], ['/profile', 'My profile']]

export default function Layout() {
  const { user, logout } = useAuth()
  const go = useNavigate()
  const out = () => { logout(); go('/login') }
  const side = ({ isActive }) => `block border-l-4 px-4 py-2 text-sm font-medium ${isActive ? 'border-gold bg-navy-soft text-white' : 'border-transparent text-ice-deep hover:text-white'}`
  const top = ({ isActive }) => `whitespace-nowrap border-b-4 px-3 py-2 text-sm ${isActive ? 'border-gold text-white' : 'border-transparent text-ice-deep'}`

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-navy py-6 md:flex">
        <div className="px-4 pb-6 font-display text-2xl text-white">AlumniConnect</div>
        <nav className="flex-1">{nav.map(([to, l]) => <NavLink key={to} to={to} className={side}>{l}</NavLink>)}</nav>
        <div className="px-4 pt-4 text-ice-deep">
          <div className="flex items-center gap-2">
            <Avatar name={user.name} size={32} />
            <div className="min-w-0 text-xs">
              <div className="truncate text-white">{user.name}</div>
              <div className="truncate">{user.university || 'Administrator'}</div>
            </div>
          </div>
          <button onClick={out} className="mt-3 text-xs underline">Sign out</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between bg-navy px-4 py-3 md:hidden">
          <span className="font-display text-xl text-white">AlumniConnect</span>
          <button onClick={out} className="text-xs text-ice-deep underline">Sign out</button>
        </header>
        <nav className="flex overflow-x-auto bg-navy-soft px-2 md:hidden">
          {nav.map(([to, l]) => <NavLink key={to} to={to} className={top}>{l}</NavLink>)}
        </nav>
        <main className="mx-auto max-w-4xl p-4 md:p-8"><Outlet /></main>
      </div>
    </div>
  )
}
