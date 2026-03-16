import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import AdminLoginPage from './pages/AdminLoginPage'
import ElectionsPage from './pages/ElectionsPage'
import ElectionDetailPage from './pages/ElectionDetailPage'
import VotePage from './pages/VotePage'
import ResultsPage from './pages/ResultsPage'
import AdminElectionsPage from './pages/admin/AdminElectionsPage'
import CreateElectionPage from './pages/admin/CreateElectionPage'
import AdminElectionDetailPage from './pages/admin/AdminElectionDetailPage'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/* Voter */}
      <Route path="/" element={<ProtectedRoute><ElectionsPage /></ProtectedRoute>} />
      <Route path="/elections/:id" element={<ProtectedRoute><ElectionDetailPage /></ProtectedRoute>} />
      <Route path="/elections/:id/vote" element={<ProtectedRoute><VotePage /></ProtectedRoute>} />
      <Route path="/results/:id" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin/elections" element={<ProtectedRoute role="admin"><AdminElectionsPage /></ProtectedRoute>} />
      <Route path="/admin/elections/new" element={<ProtectedRoute role="admin"><CreateElectionPage /></ProtectedRoute>} />
      <Route path="/admin/elections/:id" element={<ProtectedRoute role="admin"><AdminElectionDetailPage /></ProtectedRoute>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
