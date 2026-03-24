import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { connectWallet, getConnectedAddress } from '../services/web3'

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
}

// ── Candidate card ────────────────────────────────────────────────────────────

function CandidateCard({ candidate: c }) {
  const [showManifesto, setShowManifesto] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-4">
        {/* Symbol */}
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-xl shrink-0 border border-indigo-100">
          {c.symbol_url || c.candidate_name.charAt(0)}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800">{c.candidate_name}</p>
          {c.party_name && (
            <p className="text-sm text-indigo-600 font-medium">{c.party_name}</p>
          )}
          {c.constituency_name && (
            <p className="text-xs text-gray-400 mt-0.5">{c.constituency_name}</p>
          )}
        </div>

        {c.manifesto && (
          <button
            onClick={() => setShowManifesto((v) => !v)}
            className="text-xs text-gray-400 hover:text-indigo-600 shrink-0"
          >
            {showManifesto ? 'Hide' : 'Manifesto'}
          </button>
        )}
      </div>

      {showManifesto && c.manifesto && (
        <p className="mt-3 text-sm text-gray-600 border-t border-gray-50 pt-3 leading-relaxed">
          {c.manifesto}
        </p>
      )}
    </div>
  )
}

// ── Private election verification ─────────────────────────────────────────────

function PrivateVerification({ electionId, onVerified }) {
  const [voterId, setVoterId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!voterId.trim()) return
    setLoading(true)
    setError('')
    try {
      await api.post(`/api/voter/elections/${electionId}/verify`, { voter_id: voterId.trim() })
      onVerified()
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 pt-5 border-t border-gray-100">
      <p className="text-sm text-gray-600 mb-3 font-medium">
        Verify your eligibility by entering your Student or Employee ID
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={voterId}
          onChange={(e) => setVoterId(e.target.value)}
          placeholder="e.g. 1RV21CS042"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          type="submit"
          disabled={loading || !voterId.trim()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Checking…' : 'Verify'}
        </button>
      </div>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </form>
  )
}

// ── Public election verification ──────────────────────────────────────────────

function PublicVerification({ electionId, election, user, onVerified }) {
  const [form, setForm] = useState({
    address_line: user?.address_line || '',
    city: user?.city || '',
    state: user?.state || '',
    pincode: user?.pincode || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.city.trim() && !form.pincode.trim()) {
      setError('Please enter at least your city or pincode')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.post(`/api/voter/elections/${electionId}/verify`, {
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        address_line: form.address_line.trim(),
      })
      onVerified()
    } catch (err) {
      setError(err.response?.data?.message || 'Not eligible for this election')
    } finally {
      setLoading(false)
    }
  }

  const rules = election.location_rules
  const eligible_zones = rules
    ? [...(rules.districts || []), ...(rules.wards || []), ...(rules.pincodes || [])].join(', ')
    : ''

  return (
    <form onSubmit={submit} className="mt-5 pt-5 border-t border-gray-100">
      <p className="text-sm font-medium text-gray-700 mb-3">
        Enter your address to verify geographic eligibility
      </p>
      {eligible_zones && (
        <p className="text-xs text-gray-400 mb-3">
          Eligible zones: {eligible_zones}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input
          name="address_line"
          value={form.address_line}
          onChange={handleChange}
          placeholder="Address line (optional)"
          className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <input
          name="city"
          value={form.city}
          onChange={handleChange}
          placeholder="City / District *"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <input
          name="state"
          value={form.state}
          onChange={handleChange}
          placeholder="State"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <input
          name="pincode"
          value={form.pincode}
          onChange={handleChange}
          placeholder="Pincode *"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>
      <button
        type="submit"
        disabled={loading || (!form.city.trim() && !form.pincode.trim())}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? 'Checking…' : 'Verify Eligibility'}
      </button>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
    </form>
  )
}

// ── Verification status banner ────────────────────────────────────────────────

function VerifiedBanner({ electionId, isActive, navigate }) {
  return (
    <div className="mt-5 pt-5 border-t border-gray-100 flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-green-500 text-lg">✓</span>
        <span className="text-sm text-green-700 font-medium">You are verified for this election</span>
      </div>
      {isActive && (
        <button
          onClick={() => navigate(`/elections/${electionId}/vote`)}
          className="ml-auto bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-green-700"
        >
          Cast Vote →
        </button>
      )}
    </div>
  )
}

// ── Wallet link section ───────────────────────────────────────────────────────

function WalletLinkSection({ initialWallet, onLinked }) {
  const [wallet, setWallet] = useState(initialWallet || '')
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Detect if a wallet is already linked (passed in from profile or updated here)
  const linked = wallet && wallet.startsWith('0x')

  async function handleLink() {
    setLinking(true)
    setError('')
    setSuccess(false)
    try {
      const { address } = await connectWallet()
      await api.put('/api/auth/wallet', { wallet_address: address })
      setWallet(address)
      setSuccess(true)
      if (onLinked) onLinked(address)
    } catch (err) {
      if (err.message?.includes('MetaMask')) {
        setError(err.message)
      } else {
        setError(err.response?.data?.message || 'Failed to link wallet')
      }
    } finally {
      setLinking(false)
    }
  }

  if (linked) {
    return (
      <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
        Wallet linked:{' '}
        <span className="font-mono">{wallet.slice(0, 8)}…{wallet.slice(-6)}</span>
        {success && <span className="ml-auto text-green-600 font-medium">Saved!</span>}
      </div>
    )
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
      <p className="text-sm text-amber-800 font-medium mb-1">MetaMask Wallet Required</p>
      <p className="text-xs text-amber-700 mb-3">
        You must link your MetaMask wallet before voting. For private elections, your wallet address
        is added to the eligibility list when the admin locks it — link yours early.
      </p>
      <button
        onClick={handleLink}
        disabled={linking}
        className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-700 disabled:opacity-50"
      >
        {linking ? 'Connecting…' : 'Link MetaMask Wallet'}
      </button>
      {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ElectionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [election, setElection] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [linkedWallet, setLinkedWallet] = useState(user?.wallet_address || '')

  // Sync wallet from auth context on mount (profile may have it already)
  useEffect(() => {
    if (user?.wallet_address) {
      setLinkedWallet(user.wallet_address)
    } else {
      // Non-intrusive check: see if MetaMask is already connected
      getConnectedAddress().then((addr) => { if (addr) setLinkedWallet(addr) })
    }
  }, [user])

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/api/voter/elections/${id}`)
      .then(({ data }) => setElection(data.election))
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-gray-500">Loading…</p></div>
  if (error) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-red-500">{error}</p></div>
  if (!election) return null

  const isActive = election.status === 'active'
  const isScheduled = election.status === 'scheduled'
  const isCompleted = election.status === 'completed'
  const isVerified = election.verification_status === 'verified'
  const isNotEligible = election.verification_status === 'not_eligible'
  const canVerify = (isActive || isScheduled) && !isVerified && !isNotEligible

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-800">{election.title}</h1>
              {election.description && (
                <p className="text-gray-500 mt-2">{election.description}</p>
              )}
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
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                election.visibility_type === 'public'
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {election.visibility_type}
              </span>
            </div>
          </div>

          {/* Verified banner */}
          {isVerified && (
            <VerifiedBanner electionId={id} isActive={isActive} navigate={navigate} />
          )}

          {/* Not eligible notice */}
          {isNotEligible && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-sm text-red-600 font-medium">
                ✗ You are not eligible for this election
              </p>
            </div>
          )}

          {/* Wallet link — shown for active/scheduled elections when voter isn't yet verified */}
          {(isActive || isScheduled) && !isNotEligible && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <WalletLinkSection
                initialWallet={linkedWallet}
                onLinked={(addr) => setLinkedWallet(addr)}
              />
            </div>
          )}

          {/* Private verification form */}
          {canVerify && election.visibility_type === 'private' && (
            <PrivateVerification electionId={id} onVerified={load} />
          )}

          {/* Public verification */}
          {canVerify && election.visibility_type === 'public' && (
            <PublicVerification
              electionId={id}
              election={election}
              user={user}
              onVerified={load}
            />
          )}

          {/* Completed: view results */}
          {isCompleted && election.results_published && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <button
                onClick={() => navigate(`/results/${id}`)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                View Results
              </button>
            </div>
          )}

          {isCompleted && !election.results_published && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <p className="text-sm text-gray-400">Results are pending publication by the admin.</p>
            </div>
          )}
        </div>

        {/* Candidates */}
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Candidates</h2>
        <div className="grid gap-3">
          {(election.candidates || []).map((c) => (
            <CandidateCard key={c.candidate_id} candidate={c} />
          ))}
          {(!election.candidates || election.candidates.length === 0) && (
            <p className="text-gray-400 text-sm">No candidates listed yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
