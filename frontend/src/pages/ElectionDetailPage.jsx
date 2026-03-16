import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
}

export default function ElectionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [election, setElection] = useState(null)
  const [verification, setVerification] = useState(null) // null | 'pending' | 'verified' | 'failed'
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/elections/${id}`)
      .then(({ data }) => setElection(data.election))
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleVerify() {
    setVerifying(true)
    try {
      await api.post(`/api/elections/${id}/verify`)
      setVerification('verified')
    } catch (err) {
      setVerification('failed')
    } finally {
      setVerifying(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-gray-500">Loading…</p></div>
  if (error) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-red-500">{error}</p></div>
  if (!election) return null

  const isActive = election.status === 'active'
  const isCompleted = election.status === 'completed'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{election.title}</h1>
              <p className="text-gray-500 mt-2">{election.description}</p>
              <div className="flex items-center gap-2 mt-3 text-sm text-gray-400">
                <span>{new Date(election.start_time).toLocaleString()}</span>
                <span>→</span>
                <span>{new Date(election.end_time).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[election.status]}`}>
                {election.status}
              </span>
              <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                {election.visibility_type}
              </span>
            </div>
          </div>

          {/* Eligibility */}
          {isActive && (
            <div className="mt-5 pt-5 border-t border-gray-100 flex items-center gap-3">
              {verification === 'verified' ? (
                <>
                  <span className="text-sm text-green-600 font-medium">Eligible to vote</span>
                  <button
                    onClick={() => navigate(`/elections/${id}/vote`)}
                    className="ml-auto bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                  >
                    Cast Vote
                  </button>
                </>
              ) : verification === 'failed' ? (
                <span className="text-sm text-red-600">Not eligible for this election</span>
              ) : (
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="bg-white border border-indigo-500 text-indigo-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 disabled:opacity-50"
                >
                  {verifying ? 'Checking…' : 'Verify Eligibility'}
                </button>
              )}
            </div>
          )}

          {isCompleted && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <button
                onClick={() => navigate(`/results/${id}`)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                View Results
              </button>
            </div>
          )}
        </div>

        {/* Candidates */}
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Candidates</h2>
        <div className="grid gap-3">
          {(election.candidates || []).map((c) => (
            <div key={c.candidate_id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                {c.candidate_name.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-gray-800">{c.candidate_name}</p>
                {c.party_name && <p className="text-sm text-gray-500">{c.party_name}</p>}
              </div>
            </div>
          ))}
          {(!election.candidates || election.candidates.length === 0) && (
            <p className="text-gray-400 text-sm">No candidates listed yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
