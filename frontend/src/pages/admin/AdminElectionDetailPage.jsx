import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import api from '../../api/client'

// ── Job status polling hook ───────────────────────────────────────────────────

function useJobPoller(electionId, jobType, onFinished) {
  const [job, setJob] = useState(null)
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

// ── Shared UI components ──────────────────────────────────────────────────────

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

// ── Geo Eligibility Section ───────────────────────────────────────────────────

function GeoEligibilitySection({ election, onUpdate }) {
  const isDraft = election.status === 'draft'
  const isLocked = election.eligibility_locked

  const [districts, setDistricts] = useState(
    (election.location_rules?.districts || []).join(', ')
  )
  const [wards, setWards] = useState(
    (election.location_rules?.wards || []).join(', ')
  )
  const [pincodes, setPincodes] = useState(
    (election.location_rules?.pincodes || []).join(', ')
  )
  const [saving, setSaving] = useState(false)
  const [locking, setLocking] = useState(false)
  const [estimate, setEstimate] = useState(null)
  const [msg, setMsg] = useState('')

  function splitCSV(str) {
    return str.split(',').map(s => s.trim()).filter(Boolean)
  }

  async function handleSave() {
    setSaving(true)
    setMsg('')
    try {
      const { data } = await api.put(`/api/elections/${election.election_id}/geo-eligibility`, {
        districts: splitCSV(districts),
        wards: splitCSV(wards),
        pincodes: splitCSV(pincodes),
      })
      setEstimate(data.estimated_voters)
      setMsg('Rules saved. Review the estimated voter count below.')
      onUpdate()
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to save rules')
    } finally {
      setSaving(false)
    }
  }

  async function handleLock() {
    if (!confirm('Lock location-based eligibility? Geographic boundaries cannot be changed after this.')) return
    setLocking(true)
    setMsg('')
    try {
      await api.post(`/api/elections/${election.election_id}/geo-eligibility/lock`)
      setMsg('Location-based eligibility locked successfully.')
      onUpdate()
    } catch (err) {
      setMsg(err.response?.data?.message || 'Failed to lock eligibility')
    } finally {
      setLocking(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-700">Geographic Eligibility</h2>
        {isLocked && <Badge label="Locked" color="green" />}
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Define which districts, wards, or PIN codes are eligible to vote.
        Voters whose registered address falls within these boundaries will be eligible.
      </p>

      {isLocked ? (
        <div className="space-y-2 text-sm">
          {election.location_rules?.districts?.length > 0 && (
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Districts</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {election.location_rules.districts.map(d => (
                  <span key={d} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs">{d}</span>
                ))}
              </div>
            </div>
          )}
          {election.location_rules?.wards?.length > 0 && (
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">Wards</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {election.location_rules.wards.map(w => (
                  <span key={w} className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-xs">{w}</span>
                ))}
              </div>
            </div>
          )}
          {election.location_rules?.pincodes?.length > 0 && (
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide">PIN Codes</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {election.location_rules.pincodes.map(p => (
                  <span key={p} className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-xs">{p}</span>
                ))}
              </div>
            </div>
          )}
          {election.location_rule_hash && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="text-gray-400 text-xs">Rule Hash</span>
              <p className="font-mono text-xs text-gray-600 break-all mt-0.5">{election.location_rule_hash}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
              Districts <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              placeholder="e.g. Bangalore Urban, Mysuru"
              value={districts}
              onChange={e => setDistricts(e.target.value)}
              disabled={!isDraft}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
              Wards <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              placeholder="e.g. Ward 24, Ward 25, Ward 32"
              value={wards}
              onChange={e => setWards(e.target.value)}
              disabled={!isDraft}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide">
              PIN Codes <span className="text-gray-400 font-normal">(comma-separated)</span>
            </label>
            <input
              placeholder="e.g. 560001, 560002, 560078"
              value={pincodes}
              onChange={e => setPincodes(e.target.value)}
              disabled={!isDraft}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
            />
          </div>

          {estimate !== null && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
              <span className="font-semibold">Estimated eligible voters: {estimate}</span>
              <span className="ml-2 text-xs opacity-70">(based on current registered addresses)</span>
            </div>
          )}

          {msg && (
            <p className={`text-sm ${msg.includes('ailed') ? 'text-red-600' : 'text-green-600'}`}>{msg}</p>
          )}

          {isDraft && (
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save & Estimate Voters'}
              </button>
              {election.location_rules && (
                <button
                  onClick={handleLock}
                  disabled={locking}
                  className="border border-green-600 text-green-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-50 disabled:opacity-50"
                >
                  {locking ? 'Locking…' : 'Lock Location-Based Eligibility'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Candidate Card ────────────────────────────────────────────────────────────

function CandidateCard({ candidate, isDraft, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-gray-50 hover:bg-white transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          {/* Symbol badge */}
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-lg flex-shrink-0">
            {candidate.symbol_url || '🗳️'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-800">{candidate.candidate_name}</span>
              <span className="text-xs text-gray-400">#{candidate.candidate_position}</span>
            </div>
            {candidate.party_name && (
              <p className="text-sm text-indigo-600 font-medium mt-0.5">{candidate.party_name}</p>
            )}
            {candidate.constituency_name && (
              <p className="text-xs text-gray-400 mt-0.5">
                Constituency: <span className="text-gray-600">{candidate.constituency_name}</span>
              </p>
            )}
            {candidate.manifesto && (
              <div className="mt-2">
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="text-xs text-indigo-500 hover:text-indigo-700"
                >
                  {expanded ? 'Hide manifesto ▲' : 'View manifesto ▼'}
                </button>
                {expanded && (
                  <p className="mt-1 text-sm text-gray-600 bg-white rounded-lg p-3 border border-gray-100">
                    {candidate.manifesto}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        {isDraft && (
          <button
            onClick={() => onDelete(candidate.candidate_id)}
            className="text-red-400 hover:text-red-600 text-sm flex-shrink-0"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}

// ── Add Candidate Form ────────────────────────────────────────────────────────

function AddCandidateForm({ electionId, constituencies, onAdded }) {
  const [form, setForm] = useState({
    candidate_name: '',
    party_name: '',
    symbol_url: '',
    manifesto: '',
    candidate_identifier: '',
    constituency_id: constituencies[0]?.constituency_id || '',
  })
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post(`/api/elections/${electionId}/candidates`, form)
      setForm({
        candidate_name: '',
        party_name: '',
        symbol_url: '',
        manifesto: '',
        candidate_identifier: '',
        constituency_id: constituencies[0]?.constituency_id || '',
      })
      setExpanded(false)
      onAdded()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add candidate')
    } finally {
      setLoading(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
      >
        + Add Candidate
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-indigo-200 rounded-xl p-4 bg-indigo-50 space-y-3">
      <h3 className="text-sm font-semibold text-indigo-800">New Candidate</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
          <input
            name="candidate_name"
            value={form.candidate_name}
            onChange={handleChange}
            required
            placeholder="e.g. Arjun Sharma"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Party Name</label>
          <input
            name="party_name"
            value={form.party_name}
            onChange={handleChange}
            placeholder="e.g. Progressive Party"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Party Symbol <span className="text-gray-400">(emoji or text)</span>
          </label>
          <input
            name="symbol_url"
            value={form.symbol_url}
            onChange={handleChange}
            placeholder="e.g. 🌹 or Lotus"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {constituencies.length > 1 && (
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Constituency</label>
            <select
              name="constituency_id"
              value={form.constituency_id}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {constituencies.map(c => (
                <option key={c.constituency_id} value={c.constituency_id}>
                  {c.constituency_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Manifesto / Campaign Statement
          </label>
          <textarea
            name="manifesto"
            value={form.manifesto}
            onChange={handleChange}
            rows={3}
            placeholder="Describe the candidate's goals, policies, and vision…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Candidate ID <span className="text-gray-400">(optional — for validation)</span>
          </label>
          <input
            name="candidate_identifier"
            value={form.candidate_identifier}
            onChange={handleChange}
            placeholder="e.g. EMP-2024-001 or USN"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Adding…' : 'Add Candidate'}
        </button>
      </div>
    </form>
  )
}

// ── Constituency Manager (public elections) ───────────────────────────────────

function ConstituencyManager({ election, onUpdate }) {
  const isDraft = election.status === 'draft'
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      await api.post(`/api/elections/${election.election_id}/constituencies`, {
        constituency_name: newName.trim(),
      })
      setNewName('')
      onUpdate()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add constituency')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="font-semibold text-gray-700 mb-1">Constituencies</h2>
      <p className="text-sm text-gray-400 mb-4">
        Each constituency represents a ward, region, or electoral area within this election.
      </p>

      <div className="space-y-2 mb-4">
        {(election.constituencies || []).map(c => (
          <div key={c.constituency_id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
            <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
            <span className="text-sm text-gray-800">{c.constituency_name}</span>
          </div>
        ))}
      </div>

      {isDraft && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New constituency name (e.g. Ward 24)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {adding ? '…' : 'Add'}
          </button>
        </form>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminElectionDetailPage() {
  const { id } = useParams()
  const [election, setElection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // CSV upload (private only)
  const [csvFile, setCsvFile] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [voters, setVoters] = useState(null)
  const [votersLoading, setVotersLoading] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    api.get(`/api/elections/${id}`)
      .then(({ data }) => setElection(data.election))
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(reload, [reload])

  const { job: csvJob, startPolling: startCsvPoll } = useJobPoller(id, 'csv', () => {
    reload()
    loadVoters()
  })
  const { job: lockJob, startPolling: startLockPoll } = useJobPoller(id, 'lock', reload)
  const { job: endJob, startPolling: startEndPoll } = useJobPoller(id, 'end', reload)

  function loadVoters() {
    setVotersLoading(true)
    api.get(`/api/elections/${id}/voters`)
      .then(({ data }) => setVoters(data))
      .catch(() => setVoters({ voters: [], total: 0 }))
      .finally(() => setVotersLoading(false))
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
      if (data.job_id) {
        // Blockchain mode — worker handles it, poll for status
        startLockPoll(data.job_id)
      } else {
        // Mock mode — result is immediate
        if (data.status === 'failed') {
          alert(data.error || 'Lock failed')
        } else {
          reload()
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || 'Lock failed')
    }
  }

  async function handleEnd() {
    if (!confirm('End this election? Voters will no longer be able to cast votes.')) return
    try {
      const { data } = await api.post(`/api/elections/${id}/end`)
      if (data.job_id) {
        startEndPoll(data.job_id)
      } else {
        if (data.status === 'failed') {
          alert(data.error || 'End election failed')
        } else {
          reload()
        }
      }
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || 'End election failed')
    }
  }

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-gray-500">Loading…</p></div>
  if (error)   return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-red-500">{error}</p></div>
  if (!election) return null

  const isDraft     = election.status === 'draft'
  const isActive    = election.status === 'active'
  const isScheduled = election.status === 'scheduled'
  const isPublic    = election.visibility_type === 'public'
  const isLocking   = lockJob && (lockJob.status === 'queued' || lockJob.status === 'started')
  const isEnding    = endJob  && (endJob.status  === 'queued' || endJob.status  === 'started')

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
                  label={isPublic ? 'Public' : 'Private'}
                  color={isPublic ? 'green' : 'indigo'}
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
              <dt className="text-gray-400">Eligible voters</dt>
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
          <div className="mt-4 flex gap-4 text-xs">
            <span className={`flex items-center gap-1 ${election.candidates_locked ? 'text-green-600' : 'text-gray-400'}`}>
              {election.candidates_locked ? '✓' : '○'} Candidates locked
            </span>
            <span className={`flex items-center gap-1 ${election.eligibility_locked ? 'text-green-600' : 'text-gray-400'}`}>
              {election.eligibility_locked ? '✓' : '○'} Eligibility locked
            </span>
          </div>
        </div>

        {/* ── Geographic Eligibility (public elections) ── */}
        {isPublic && (
          <GeoEligibilitySection election={election} onUpdate={reload} />
        )}

        {/* ── Constituency Management (public elections) ── */}
        {isPublic && (
          <ConstituencyManager election={election} onUpdate={reload} />
        )}

        {/* ── Candidates ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-700 mb-4">
            Candidates
            {election.candidates?.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                ({election.candidates.length})
              </span>
            )}
          </h2>

          {(election.candidates || []).length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">No candidates added yet.</p>
          ) : (
            <div className="space-y-3 mb-4">
              {election.candidates.map((c) => (
                <CandidateCard
                  key={c.candidate_id}
                  candidate={c}
                  isDraft={isDraft}
                  onDelete={handleDeleteCandidate}
                />
              ))}
            </div>
          )}

          {isDraft && (
            <AddCandidateForm
              electionId={id}
              constituencies={election.constituencies || []}
              onAdded={reload}
            />
          )}
        </div>

        {/* ── CSV Upload (private + draft only) ── */}
        {!isPublic && isDraft && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-700 mb-1">Voter Eligibility List (CSV)</h2>
            <p className="text-sm text-gray-400 mb-4">
              One voter ID per row. Re-uploading replaces the previous list.
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

        {/* ── Voter eligibility list (private only) ── */}
        {!isPublic && (
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
