import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, role }) {
  const { user, isAdmin, isSuperAdmin } = useAuth()

  if (!user) return <Navigate to="/login" replace />

  if (role === 'admin' && !isAdmin) return <Navigate to="/profile" replace />
  if (role === 'super_admin' && !isSuperAdmin) return <Navigate to="/profile" replace />

  return children
}
