import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'

export default function VotePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [election, setElection] = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/elections/${id}`)
      .then(({ data }) => setElection(data.election))
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleVote() {
    setSubmitting(true)
    setError('')
    try {
      // TODO (TASK-012): call smart contract via ethers.js, then record tx hash
      await api.post('/api/votes/record', {
        election_id: id,
        candidate_id: selected,
      })
      navigate(`/results/${id}`)
    } catch (err) {
      setError(err.response?.data?.message || 'Vote failed')
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-gray-500">Loading…</p></div>
  if (error && !election) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-red-500">{error}</p></div>

  const selectedCandidate = election?.candidates?.find((c) => c.candidate_id === selected)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Cast Your Vote</h1>
        <p className="text-sm text-gray-500 mb-6">{election?.title}</p>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>
        )}

        <div className="grid gap-3 mb-6">
          {(election?.candidates || []).map((c) => (
            <button
              key={c.candidate_id}
              onClick={() => setSelected(c.candidate_id)}
              className={`w-full text-left rounded-xl border p-4 flex items-center gap-4 transition ${
                selected === c.candidate_id
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : 'border-gray-200 bg-white hover:border-indigo-300'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm shrink-0">
                {c.candidate_name.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-gray-800">{c.candidate_name}</p>
                {c.party_name && <p className="text-sm text-gray-500">{c.party_name}</p>}
              </div>
              {selected === c.candidate_id && (
                <span className="ml-auto text-indigo-600 text-lg">✓</span>
              )}
            </button>
          ))}
        </div>

        <button
          disabled={!selected}
          onClick={() => setConfirming(true)}
          className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-40"
        >
          Review &amp; Confirm
        </button>

        {/* Confirmation modal */}
        {confirming && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
              <h2 className="text-lg font-bold text-gray-800 mb-2">Confirm Vote</h2>
              <p className="text-sm text-gray-500 mb-4">
                You are voting for <span className="font-semibold text-gray-800">{selectedCandidate?.candidate_name}</span>.
                This action cannot be undone.
              </p>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVote}
                  disabled={submitting}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Confirm Vote'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
