import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import api from '../../api/client'

export default function AdminElectionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [election, setElection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState('')

  // Add candidate form
  const [candidateName, setCandidateName] = useState('')
  const [partyName, setPartyName] = useState('')
  const [addingCandidate, setAddingCandidate] = useState(false)

  // CSV upload
  const [csvFile, setCsvFile] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')

  function reload() {
    setLoading(true)
    api.get(`/api/elections/${id}`)
      .then(({ data }) => setElection(data.election))
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [id])

  async function handleAddCandidate(e) {
    e.preventDefault()
    setAddingCandidate(true)
    try {
      await api.post(`/api/elections/${id}/candidates`, { candidate_name: candidateName, party_name: partyName })
      setCandidateName('')
      setPartyName('')
      reload()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add candidate')
    } finally {
      setAddingCandidate(false)
    }
  }

  async function handleDeleteCandidate(cid) {
    if (!confirm('Remove this candidate?')) return
    try {
      await api.delete(`/api/elections/${id}/candidates/${cid}`)
      reload()
    } catch {
      alert('Failed to remove candidate')
    }
  }

  async function handleCsvUpload(e) {
    e.preventDefault()
    if (!csvFile) return
    setUploadLoading(true)
    setUploadMsg('')
    const formData = new FormData()
    formData.append('file', csvFile)
    try {
      const { data } = await api.post(`/api/elections/${id}/voters/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setUploadMsg(`Uploaded ${data.count} voters`)
      setCsvFile(null)
    } catch (err) {
      setUploadMsg(err.response?.data?.message || 'Upload failed')
    } finally {
      setUploadLoading(false)
    }
  }

  async function handleAction(action) {
    setActionLoading(action)
    try {
      if (action === 'lock') await api.post(`/api/elections/${id}/lock`)
      if (action === 'end') await api.post(`/api/elections/${id}/end`)
      reload()
    } catch (err) {
      alert(err.response?.data?.message || `Action '${action}' failed`)
    } finally {
      setActionLoading('')
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-gray-500">Loading…</p></div>
  if (error) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-red-500">{error}</p></div>
  if (!election) return null

  const isDraft = election.status === 'draft'
  const isActive = election.status === 'active'

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/admin/elections" className="hover:text-indigo-600">Elections</Link>
            <span>/</span>
            <span>{election.title}</span>
          </div>
          <div className="flex items-start justify-between">
            <h1 className="text-2xl font-bold text-gray-800">{election.title}</h1>
            <div className="flex gap-2">
              {isDraft && (
                <button
                  onClick={() => handleAction('lock')}
                  disabled={actionLoading === 'lock'}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actionLoading === 'lock' ? 'Locking…' : 'Lock & Deploy'}
                </button>
              )}
              {isActive && (
                <button
                  onClick={() => handleAction('end')}
                  disabled={actionLoading === 'end'}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading === 'end' ? 'Ending…' : 'End Election'}
                </button>
              )}
            </div>
          </div>
          <p className="text-gray-500 mt-1">{election.description}</p>
          {election.contract_address && (
            <p className="text-xs text-gray-400 font-mono mt-1">Contract: {election.contract_address}</p>
          )}
        </div>

        {/* Candidates */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Candidates</h2>
          <div className="space-y-2 mb-4">
            {(election.candidates || []).map((c) => (
              <div key={c.candidate_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div>
                  <span className="font-medium text-gray-800">{c.candidate_name}</span>
                  {c.party_name && <span className="text-sm text-gray-400 ml-2">{c.party_name}</span>}
                </div>
                {isDraft && (
                  <button
                    onClick={() => handleDeleteCandidate(c.candidate_id)}
                    className="text-red-400 hover:text-red-600 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {(!election.candidates || election.candidates.length === 0) && (
              <p className="text-sm text-gray-400">No candidates yet.</p>
            )}
          </div>

          {isDraft && (
            <form onSubmit={handleAddCandidate} className="flex gap-2 mt-4">
              <input
                placeholder="Candidate name"
                value={candidateName}
                onChange={(e) => setCandidateName(e.target.value)}
                required
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                placeholder="Party (optional)"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={addingCandidate}
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Add
              </button>
            </form>
          )}
        </div>

        {/* CSV voter upload (private elections only) */}
        {election.visibility_type === 'private' && isDraft && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-700 mb-1">Voter List (CSV)</h2>
            <p className="text-sm text-gray-400 mb-4">Upload a CSV with one voter ID per row.</p>
            <form onSubmit={handleCsvUpload} className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files[0])}
                className="text-sm text-gray-600"
              />
              <button
                type="submit"
                disabled={!csvFile || uploadLoading}
                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploadLoading ? 'Uploading…' : 'Upload'}
              </button>
            </form>
            {uploadMsg && <p className="text-sm mt-2 text-gray-500">{uploadMsg}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
