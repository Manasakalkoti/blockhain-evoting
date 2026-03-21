import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import api from '../../api/client'

// ── Job status polling hook ───────────────────────────────────────────────────

function useJobPoller(electionId, jobType, onFinished) {
  const [job, setJob] = useState(null)   // { status, result, error, job_id }
  const intervalRef = useRef(null)

  const start = useCallback((jobId) => {
    setJob({ job_id: jobId, status: 'queued' })
    intervalRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(
          `/api/elections/${electionId}/job-status?type=${jobType}`
        )
        setJob(data)
        if (data.status === 'finished' || data.status === 'failed') {
          clearInterval(intervalRef.current)
          if (data.status === 'finished') onFinished(data.result)
        }
      } catch {
        clearInterval(intervalRef.current)
      }
    }, 1500)
  }, [electionId, jobType, onFinished])

  useEffect(() => () => clearInterval(intervalRef.current), [])

  return { job, startPolling: start }
}

// ── Status badge ─────────────────────────────────────────────────────────────

function Badge({ label, color }) {
  const colors = {
    gray:   'bg-gray-100 text-gray-600',
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red:    'bg-red-100 text-red-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${colors[color] || colors.gray}`}>
      {label}
    </span>
  )
}

function electionStatusColor(status) {
  return { draft: 'gray', scheduled: 'blue', active: 'green', completed: 'indigo' }[status] || 'gray'
}

// ── Job status panel ─────────────────────────────────────────────────────────

function JobPanel({ job, label }) {
  if (!job) return null
  const colors = {
    queued:   'bg-yellow-50 border-yellow-200 text-yellow-800',
    started:  'bg-blue-50 border-blue-200 text-blue-800',
    finished: 'bg-green-50 border-green-200 text-green-800',
    failed:   'bg-red-50 border-red-200 text-red-800',
  }
  const cls = colors[job.status] || colors.queued
  const running = job.status === 'queued' || job.status === 'started'
  return (
    <div className={`border rounded-lg px-4 py-3 text-sm ${cls}`}>
      <div className="flex items-center gap-2">
        {running && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        )}
        <span className="font-medium">{label}: {job.status}</span>
      </div>
      {job.status === 'finished' && job.result && (
        <ul className="mt-1 ml-6 list-disc text-xs opacity-80 space-y-0.5">
          {job.result.voter_count !== undefined && <li>{job.result.voter_count} voters loaded</li>}
          {job.result.candidate_count !== undefined && <li>{job.result.candidate_count} candidates</li>}
          {job.result.contract_address && <li>Contract: {job.result.contract_address}</li>}
          {job.result.merkle_root && <li>Merkle root set</li>}
          {job.result.count !== undefined && <li>{job.result.count} voters imported</li>}
          {job.result.ended_at && <li>Ended at {job.result.ended_at}</li>}
        </ul>
      )}
      {job.status === 'failed' && job.error && (
        <p className="mt-1 text-xs opacity-80">{job.error}</p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminElectionDetailPage() {
  const { id } = useParams()
  const [election, setElection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Candidates
  const [candidateName, setCandidateName] = useState('')
  const [partyName, setPartyName] = useState('')
  const [addingCandidate, setAddingCandidate] = useState(false)

  // Voter list
  const [voters, setVoters] = useState(null)   // null = not loaded yet
  const [votersLoading, setVotersLoading] = useState(false)

  // CSV upload
  const [csvFile, setCsvFile] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)

  // Reload election
  const reload = useCallback(() => {
    setLoading(true)
    api.get(`/api/elections/${id}`)
      .then(({ data }) => setElection(data.election))
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(reload, [reload])

  // Job pollers
  const { job: csvJob, startPolling: startCsvPoll } = useJobPoller(id, 'csv', () => {
    reload()
    loadVoters()
  })
  const { job: lockJob, startPolling: startLockPoll } = useJobPoller(id, 'lock', reload)
  const { job: endJob, startPolling: startEndPoll } = useJobPoller(id, 'end', reload)

  // Load voter list
  function loadVoters() {
    setVotersLoading(true)
    api.get(`/api/elections/${id}/voters`)
      .then(({ data }) => setVoters(data))
      .catch(() => setVoters({ voters: [], total: 0 }))
      .finally(() => setVotersLoading(false))
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleAddCandidate(e) {
    e.preventDefault()
    setAddingCandidate(true)
    try {
      await api.post(`/api/elections/${id}/candidates`, {
        candidate_name: candidateName,
        party_name: partyName,
      })
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
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove candidate')
    }
  }

  async function handleCsvUpload(e) {
    e.preventDefault()
    if (!csvFile) return
    setUploadLoading(true)
    const formData = new FormData()
    formData.append('file', csvFile)
    try {
      const { data } = await api.post(
        `/api/elections/${id}/voters/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      setCsvFile(null)
      startCsvPoll(data.job_id)
    } catch (err) {
      alert(err.response?.data?.message || 'Upload failed')
    } finally {
      setUploadLoading(false)
    }
  }

  async function handleLock() {
    if (!confirm('Lock this election and deploy the contract? This cannot be undone.')) return
    try {
      const { data } = await api.post(`/api/elections/${id}/lock`)
      startLockPoll(data.job_id)
    } catch (err) {
      alert(err.response?.data?.message || 'Lock failed')
    }
  }

  async function handleEnd() {
    if (!confirm('End this election? Voters will no longer be able to cast votes.')) return
    try {
      const { data } = await api.post(`/api/elections/${id}/end`)
      startEndPoll(data.job_id)
    } catch (err) {
      alert(err.response?.data?.message || 'End election failed')
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-gray-500">Loading…</p></div>
  if (error)   return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-red-500">{error}</p></div>
  if (!election) return null

  const isDraft    = election.status === 'draft'
  const isActive   = election.status === 'active'
  const isScheduled = election.status === 'scheduled'
  const isLocking  = lockJob && (lockJob.status === 'queued' || lockJob.status === 'started')
  const isEnding   = endJob  && (endJob.status  === 'queued' || endJob.status  === 'started')

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/admin/elections" className="hover:text-indigo-600">Elections</Link>
            <span>/</span>
            <span className="truncate">{election.title}</span>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-gray-800">{election.title}</h1>
                <Badge label={election.status} color={electionStatusColor(election.status)} />
                <Badge
                  label={election.visibility_type}
                  color={election.visibility_type === 'private' ? 'indigo' : 'green'}
                />
              </div>
              {election.description && (
                <p className="text-gray-500 text-sm">{election.description}</p>
              )}
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {isDraft && (
                <button
                  onClick={handleLock}
                  disabled={isLocking}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isLocking ? 'Locking…' : 'Lock Election'}
                </button>
              )}
              {(isActive || isScheduled) && (
                <button
                  onClick={handleEnd}
                  disabled={isEnding}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {isEnding ? 'Ending…' : 'End Election'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Job status panels ── */}
        <div className="space-y-2">
          <JobPanel job={lockJob} label="Lock & Deploy" />
          <JobPanel job={endJob}  label="End Election"  />
        </div>

        {/* ── Election info ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-gray-400">Type</dt>
              <dd className="text-gray-800 capitalize">{election.election_type.replace('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Voters eligible</dt>
              <dd className="text-gray-800">{election.voter_count}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Start</dt>
              <dd className="text-gray-800">{new Date(election.start_time).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-gray-400">End</dt>
              <dd className="text-gray-800">{new Date(election.end_time).toLocaleString()}</dd>
            </div>
            {election.eligibility_merkle_root && (
              <div className="col-span-2">
                <dt className="text-gray-400">Merkle root</dt>
                <dd className="text-gray-700 font-mono text-xs break-all mt-0.5">
                  {election.eligibility_merkle_root}
                </dd>
              </div>
            )}
            {election.contract_address && (
              <div className="col-span-2">
                <dt className="text-gray-400">Contract address</dt>
                <dd className="text-gray-700 font-mono text-xs break-all mt-0.5">
                  {election.contract_address}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-4 flex gap-3 text-xs">
            <span className={`flex items-center gap-1 ${election.candidates_locked ? 'text-green-600' : 'text-gray-400'}`}>
              {election.candidates_locked ? '✓' : '○'} Candidates locked
            </span>
            <span className={`flex items-center gap-1 ${election.eligibility_locked ? 'text-green-600' : 'text-gray-400'}`}>
              {election.eligibility_locked ? '✓' : '○'} Eligibility locked
            </span>
          </div>
        </div>

        {/* ── Candidates ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-700 mb-4">Candidates</h2>

          {(election.candidates || []).length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">No candidates yet.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {election.candidates.map((c) => (
                <div
                  key={c.candidate_id}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-5 text-right">{c.candidate_position}.</span>
                    <div>
                      <span className="font-medium text-gray-800">{c.candidate_name}</span>
                      {c.party_name && (
                        <span className="text-sm text-gray-400 ml-2">{c.party_name}</span>
                      )}
                    </div>
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
            </div>
          )}

          {isDraft && (
            <form onSubmit={handleAddCandidate} className="flex gap-2 mt-2">
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
                {addingCandidate ? '…' : 'Add'}
              </button>
            </form>
          )}
        </div>

        {/* ── CSV upload (private + draft only) ── */}
        {election.visibility_type === 'private' && isDraft && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-700 mb-1">Voter Eligibility List (CSV)</h2>
            <p className="text-sm text-gray-400 mb-4">
              One voter ID per row. Re-uploading replaces the previous list.
              Processing runs in the background — you can poll for status below.
            </p>

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
                {uploadLoading ? 'Queuing…' : 'Upload'}
              </button>
            </form>

            <div className="mt-3">
              <JobPanel job={csvJob} label="CSV import" />
            </div>
          </div>
        )}

        {/* ── Voter eligibility list ── */}
        {election.visibility_type === 'private' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-700">
                Eligibility List
                {voters && (
                  <span className="ml-2 text-sm font-normal text-gray-400">
                    ({voters.total} voters
                    {voters.verified_count > 0 && `, ${voters.verified_count} verified`})
                  </span>
                )}
              </h2>
              <button
                onClick={loadVoters}
                disabled={votersLoading}
                className="text-indigo-600 hover:text-indigo-700 text-sm font-medium disabled:opacity-50"
              >
                {votersLoading ? 'Loading…' : voters ? 'Refresh' : 'Load list'}
              </button>
            </div>

            {voters && voters.voters.length > 0 ? (
              <div className="overflow-auto max-h-72">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-400 border-b">
                      <th className="pb-2 font-medium">#</th>
                      <th className="pb-2 font-medium">Voter ID</th>
                      <th className="pb-2 font-medium">Leaf hash (keccak256)</th>
                      <th className="pb-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voters.voters.map((v, i) => (
                      <tr key={v.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-gray-400 pr-3">{i + 1}</td>
                        <td className="py-1.5 text-gray-800 font-mono">{v.voter_identifier}</td>
                        <td className="py-1.5 text-gray-400 font-mono text-xs truncate max-w-[180px]">
                          {v.hashed_identifier.slice(0, 14)}…
                        </td>
                        <td className="py-1.5">
                          <Badge label={v.authorization_status} color="green" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : voters ? (
              <p className="text-sm text-gray-400">No voters imported yet.</p>
            ) : (
              <p className="text-sm text-gray-400">Click "Load list" to view eligible voters.</p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
