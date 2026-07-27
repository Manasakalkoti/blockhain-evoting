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

// Step 1: find constituency by district+pincode OR from dropdown
// Step 2: verify with Aadhaar + full address for that constituency
function PublicVerification({ electionId, election, user, onVerified }) {
  const constituencies = election.constituencies || []

  // Step 1 state
  const [findDistrict, setFindDistrict] = useState('')
  const [findPincode, setFindPincode] = useState('')
  const [findLoading, setFindLoading] = useState(false)
  const [findError, setFindError] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  // Shared: which constituency was chosen (step 1 result or dropdown pick)
  const [chosenConstituency, setChosenConstituency] = useState(null)

  // Step 2 state
  const [form, setForm] = useState({
    aadhaar_number: '',
    address_line: '',
    city: '',
    state: '',
    pincode: '',
  })
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [verifyError, setVerifyError] = useState('')

  // ── Step 1a: auto-find by district + pincode (client-side match) ──────────
  function handleAutoFind(e) {
    e.preventDefault()
    setFindError('')
    const distLower = findDistrict.trim().toLowerCase()
    const pin = findPincode.trim()
    if (!distLower && !pin) {
      setFindError('Enter at least a district or pincode.')
      return
    }
    setFindLoading(true)
    const matched = constituencies.find(c => {
      const rules = c.location_rules || {}
      const cDist = (rules.districts || []).map(d => d.toLowerCase())
      const cWards = (rules.wards || []).map(w => w.toLowerCase())
      const cPins = rules.pincodes || []
      return (
        (pin && cPins.includes(pin))
        || (distLower && cDist.includes(distLower))
        || (distLower && cWards.includes(distLower))
      )
    })
    setFindLoading(false)
    if (!matched) {
      setFindError('No constituency found for that district/pincode. Try browsing the list below.')
      return
    }
    // Pre-fill city and pincode from what they searched
    setForm(f => ({ ...f, city: findDistrict.trim(), pincode: findPincode.trim() }))
    setChosenConstituency(matched)
  }

  function handleFormChange(e) {
    const { name, value } = e.target
    if (name === 'aadhaar_number') {
      if (/^\d{0,12}$/.test(value)) setForm(f => ({ ...f, aadhaar_number: value }))
      return
    }
    setForm(f => ({ ...f, [name]: value }))
  }

  // ── Step 2: submit full verification ─────────────────────────────────────
  async function handleVerify(e) {
    e.preventDefault()
    if (form.aadhaar_number.length !== 12) { setVerifyError('Aadhaar must be exactly 12 digits'); return }
    if (!form.address_line.trim()) { setVerifyError('Address line is required'); return }
    if (!form.city.trim()) { setVerifyError('City / District is required'); return }
    if (!form.state.trim()) { setVerifyError('State is required'); return }
    if (!form.pincode.trim()) { setVerifyError('Pincode is required'); return }
    setVerifyLoading(true)
    setVerifyError('')
    try {
      await api.post(`/api/voter/elections/${electionId}/verify`, {
        aadhaar_number: form.aadhaar_number,
        address_line:  form.address_line.trim(),
        city:          form.city.trim(),
        state:         form.state.trim(),
        pincode:       form.pincode.trim(),
      })
      onVerified()
    } catch (err) {
      setVerifyError(err.response?.data?.message || 'Verification failed. Check your details.')
    } finally {
      setVerifyLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mt-5 pt-5 border-t border-gray-100">
      <p className="text-sm font-semibold text-gray-700 mb-1">Find Your Constituency</p>
      <p className="text-xs text-gray-400 mb-4">
        Enter your district and pincode to identify your constituency, then verify with Aadhaar.
      </p>

      {!chosenConstituency ? (
        <>
          {/* Step 1a: auto-find */}
          <form onSubmit={handleAutoFind} className="space-y-2 mb-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={findDistrict}
                onChange={e => setFindDistrict(e.target.value)}
                placeholder="District / Ward *"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <input
                value={findPincode}
                onChange={e => setFindPincode(e.target.value)}
                placeholder="Pincode *"
                inputMode="numeric"
                maxLength={6}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <button
              type="submit"
              disabled={findLoading || (!findDistrict.trim() && !findPincode.trim())}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {findLoading ? 'Finding…' : 'Find My Constituency'}
            </button>
            {findError && <p className="text-red-500 text-xs mt-1">{findError}</p>}
          </form>

          {/* Step 1b: browse all constituencies with their candidates */}
          <div className="border-t border-gray-100 pt-3">
            <button
              onClick={() => setShowDropdown(v => !v)}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {showDropdown ? '▲ Hide constituency list' : '▼ Browse all constituencies'}
            </button>
            {showDropdown && (
              <div className="mt-3 space-y-3">
                {constituencies.map(c => (
                  <div key={c.constituency_id} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Constituency header — click to select */}
                    <button
                      onClick={() => { setChosenConstituency(c); setShowDropdown(false) }}
                      className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-indigo-50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <span className="font-semibold text-sm text-gray-800">{c.constituency_name}</span>
                        {c.location_rules && (
                          <span className="ml-2 text-xs text-gray-400">
                            {[
                              ...(c.location_rules.districts || []),
                              ...(c.location_rules.wards || []),
                              ...(c.location_rules.pincodes || []),
                            ].slice(0, 3).join(', ')}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-indigo-600 font-medium shrink-0 ml-2">Select →</span>
                    </button>

                    {/* Candidates for this constituency */}
                    {(c.candidates || []).length > 0 ? (
                      <div className="divide-y divide-gray-100">
                        {c.candidates.map(cand => (
                          <div key={cand.candidate_id} className="px-4 py-2.5 flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-sm shrink-0">
                              {cand.symbol_url || cand.candidate_name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-700 truncate">{cand.candidate_name}</p>
                              {cand.party_name && (
                                <p className="text-xs text-indigo-500">{cand.party_name}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="px-4 py-2.5 text-xs text-gray-400">No candidates listed.</p>
                    )}
                  </div>
                ))}
                {constituencies.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-3">No constituencies configured yet.</p>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Step 2: verify */
        <div>
          {/* Chosen constituency banner */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Your Constituency</p>
              <p className="text-sm font-semibold text-indigo-800 mt-0.5">{chosenConstituency.constituency_name}</p>
            </div>
            <button
              onClick={() => { setChosenConstituency(null); setVerifyError('') }}
              className="text-xs text-indigo-500 hover:text-indigo-700 underline"
            >
              Change
            </button>
          </div>

          <p className="text-sm font-medium text-gray-700 mb-1">Step 2 — KYC Verification</p>
          <p className="text-xs text-gray-400 mb-3">
            Enter your Aadhaar and address to confirm you belong to this constituency.
          </p>

          <form onSubmit={handleVerify} className="space-y-2">
            {/* Aadhaar */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Aadhaar Number <span className="text-red-500">*</span>
              </label>
              <input
                name="aadhaar_number"
                value={form.aadhaar_number}
                onChange={handleFormChange}
                placeholder="12-digit Aadhaar number"
                maxLength={12}
                inputMode="numeric"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                {form.aadhaar_number.length}/12 digits
                {form.aadhaar_number.length === 12 && <span className="text-green-600 ml-2">✓</span>}
              </p>
            </div>

            {/* Address fields */}
            <input
              name="address_line"
              value={form.address_line}
              onChange={handleFormChange}
              placeholder="Address line *"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                name="city"
                value={form.city}
                onChange={handleFormChange}
                placeholder="City / District *"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <input
                name="state"
                value={form.state}
                onChange={handleFormChange}
                placeholder="State *"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <input
                name="pincode"
                value={form.pincode}
                onChange={handleFormChange}
                placeholder="Pincode *"
                inputMode="numeric"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <button
              type="submit"
              disabled={
                verifyLoading ||
                form.aadhaar_number.length !== 12 ||
                !form.address_line.trim() ||
                !form.city.trim() ||
                !form.state.trim() ||
                !form.pincode.trim()
              }
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {verifyLoading ? 'Verifying…' : 'Verify with Aadhaar'}
            </button>
            {verifyError && <p className="text-red-500 text-sm mt-2">{verifyError}</p>}
          </form>
        </div>
      )}
    </div>
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

  // When an already-connected wallet is passed in, ensure it's saved to the backend
  useEffect(() => {
    if (initialWallet && initialWallet.startsWith('0x')) {
      api.put('/api/auth/wallet', { wallet_address: initialWallet }).catch(() => {})
    }
  }, [initialWallet])

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
      // Non-intrusive check: see if MetaMask is already connected, then save to backend
      getConnectedAddress().then((addr) => {
        if (addr) {
          setLinkedWallet(addr)
          api.put('/api/auth/wallet', { wallet_address: addr }).catch(() => {})
        }
      })
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
  const canVerify = (isActive || isScheduled) && !isVerified

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
                {election.visibility_type === 'public'
                  ? '✗ The details entered are not eligible for voting in this election. Please enter correct details.'
                  : '✗ Wrong ID entered — please try again with the correct voter ID'}
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

          {/* Eligibility pre-check banner for upcoming elections */}
          {isScheduled && !isVerified && !isNotEligible && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-blue-800">Pre-check your eligibility now</p>
              <p className="text-xs text-blue-700 mt-0.5">
                This election hasn't started yet. Verify your eligibility early so you're ready to vote the moment it opens.
              </p>
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

        {/* Candidates — filtered to verified constituency for public elections */}
        {(() => {
          const allCandidates = election.candidates || []
          const vc = election.verified_constituency // null unless public + verified

          const visibleCandidates = (isVerified && vc)
            ? allCandidates.filter(c => c.constituency_id === vc.constituency_id)
            : allCandidates

          return (
            <>
              {isVerified && vc && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-4">
                  <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Your Constituency</p>
                  <p className="text-sm font-semibold text-indigo-800 mt-0.5">{vc.constituency_name}</p>
                  <p className="text-xs text-indigo-600 mt-0.5">Showing candidates for your constituency only.</p>
                </div>
              )}
              <h2 className="text-lg font-semibold text-gray-700 mb-3">Candidates</h2>
              <div className="grid gap-3">
                {visibleCandidates.map((c) => (
                  <CandidateCard key={c.candidate_id} candidate={c} />
                ))}
                {visibleCandidates.length === 0 && (
                  <p className="text-gray-400 text-sm">No candidates listed yet.</p>
                )}
              </div>
            </>
          )
        })()}
      </div>
    </div>
  )
}
