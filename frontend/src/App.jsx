import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'

// Public pages
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import OrgRegisterPage from './pages/OrgRegisterPage'

// Profile picker (post-login)
import ProfilePickerPage from './pages/ProfilePickerPage'

// Voter pages
import ElectionsPage from './pages/ElectionsPage'
import ElectionDetailPage from './pages/ElectionDetailPage'
import VotePage from './pages/VotePage'
import ResultsPage from './pages/ResultsPage'
import MyVotesPage from './pages/MyVotesPage'

// Admin pages
import AdminElectionsPage from './pages/admin/AdminElectionsPage'
import CreateElectionPage from './pages/admin/CreateElectionPage'
import AdminElectionDetailPage from './pages/admin/AdminElectionDetailPage'

// Super Admin pages
import SuperAdminDashboardPage from './pages/super_admin/SuperAdminDashboardPage'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/org/register" element={<OrgRegisterPage />} />

      {/* Profile picker — shown after login for all roles */}
      <Route path="/profile" element={<ProtectedRoute><ProfilePickerPage /></ProtectedRoute>} />

      {/* Voter */}
      <Route path="/" element={<ProtectedRoute><ElectionsPage /></ProtectedRoute>} />
      <Route path="/elections/:id" element={<ProtectedRoute><ElectionDetailPage /></ProtectedRoute>} />
      <Route path="/elections/:id/vote" element={<ProtectedRoute><VotePage /></ProtectedRoute>} />
      <Route path="/results/:id" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
      <Route path="/my-votes" element={<ProtectedRoute><MyVotesPage /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin/elections" element={<ProtectedRoute role="admin"><AdminElectionsPage /></ProtectedRoute>} />
      <Route path="/admin/elections/new" element={<ProtectedRoute role="admin"><CreateElectionPage /></ProtectedRoute>} />
      <Route path="/admin/elections/:id" element={<ProtectedRoute role="admin"><AdminElectionDetailPage /></ProtectedRoute>} />

      {/* Super Admin (Organisation owner) */}
      <Route path="/org/dashboard" element={<ProtectedRoute role="super_admin"><SuperAdminDashboardPage /></ProtectedRoute>} />

      {/* Fallback — no RC route */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
