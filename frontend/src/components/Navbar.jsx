import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <nav className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between shadow-md">
      <Link to={isAdmin ? '/admin/elections' : '/'} className="text-lg font-bold tracking-tight">
        E-Vote
      </Link>

      <div className="flex items-center gap-4">
        {user && !isAdmin && (
          <>
            <Link to="/" className="text-sm hover:text-indigo-400">Elections</Link>
            <Link to="/my-votes" className="text-sm hover:text-indigo-400">My Votes</Link>
          </>
        )}
        {isAdmin && (
          <Link to="/admin/elections" className="text-sm hover:text-indigo-400">Dashboard</Link>
        )}
        {user && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">{user.full_name || user.email}</span>
            <button onClick={handleLogout} className="text-sm text-red-400 hover:text-red-300">
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
