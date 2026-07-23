import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { connectWallet } from '../services/web3'

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeUntil(dateStr) {
  const diff = new Date(dateStr) - new Date()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// ── Wallet Banner ─────────────────────────────────────────────────────────────

function WalletBanner({ onLinked }) {
  const [linking, setLinking] = useState(false)

  async function handleLink() {
    setLinking(true)
    try {
      const { address } = await connectWallet()
      await api.put('/api/auth/wallet', { wallet_address: address })
      onLinked(address)
    } catch {
      alert('Could not connect MetaMask. Make sure it is installed and unlocked.')
    } finally {
      setLinking(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
      <div>
        <p className="text-sm font-semibold text-amber-800">Wallet not linked</p>
        <p className="text-xs text-amber-700 mt-0.5">Link your MetaMask wallet now to be ready to vote when elections open.</p>
      </div>
      <button
        onClick={handleLink}
        disabled={linking}
        className="shrink-0 bg-amber-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-amber-700 disabled:opacity-50"
      >
        {linking ? 'Connecting…' : 'Link Wallet'}
      </button>
    </div>
  )
}

// ── Election Card ─────────────────────────────────────────────────────────────

function ElectionCard({ election }) {
  const verif = election.verification_status
  const until = election.status === 'scheduled' ? timeUntil(election.start_time) : null

  return (
    <Link
      to={`/elections/${election.election_id}`}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition block"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 truncate">{election.title}</h3>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
            <span>{new Date(election.start_time).toLocaleString()}</span>
            <span>→</span>
            <span>{new Date(election.end_time).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {/* Upcoming alert */}
          {until && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
              Starts in {until}
            </span>
          )}
          {/* Verification badge */}
          {verif === 'verified' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">✓ Verified</span>
          )}
          {verif === 'not_eligible' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Not Eligible</span>
          )}
          {!verif && election.status === 'scheduled' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">Pre-check →</span>
          )}
          {!verif && election.status === 'active' && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 font-medium">Verify to vote</span>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── Followed Org Card ─────────────────────────────────────────────────────────

function FollowedOrgCard({ org, onSelect, onUnfollow }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-semibold text-gray-800 text-sm">{org.name}</p>
          <p className="text-xs text-gray-400">{org.type}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelect(org)}
            className="text-xs text-indigo-600 hover:underline font-medium"
          >
            View All →
          </button>
          <button
            onClick={() => onUnfollow(org)}
            className="text-xs text-gray-400 hover:text-red-500"
          >
            Unfollow
          </button>
        </div>
      </div>
      {org.elections.length === 0 ? (
        <p className="text-xs text-gray-400">No active or upcoming elections.</p>
      ) : (
        <div className="space-y-2">
          {org.elections.map((e) => {
            const until = e.status === 'scheduled' ? timeUntil(e.start_time) : null
            return (
              <Link
                key={e.election_id}
                to={`/elections/${e.election_id}`}
                className="flex items-center justify-between text-xs bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition"
              >
                <span className="text-gray-700 font-medium truncate">{e.title}</span>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {until && <span className="text-blue-600">Starts in {until}</span>}
                  {e.status === 'active' && <span className="text-green-600 font-semibold">● Live</span>}
                  {e.verification_status === 'verified' && <span className="text-green-600">✓</span>}
                  {!e.verification_status && <span className="text-yellow-600">Pre-check</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ElectionsPage() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()

  const [orgQuery, setOrgQuery] = useState('')
  const [orgs, setOrgs] = useState([])
  const [selectedOrg, setSelectedOrg] = useState(null)
  const [elections, setElections] = useState({ upcoming: [], running: [], completed: [] })
  const [following, setFollowing] = useState([])
  const [loadingOrgs, setLoadingOrgs] = useState(false)
  const [loadingElections, setLoadingElections] = useState(false)
  const [loadingFollowing, setLoadingFollowing] = useState(true)
  const [error, setError] = useState('')
  const [hasWallet, setHasWallet] = useState(!!user?.wallet_address)

  // Load followed orgs on mount
  useEffect(() => {
    api.get('/api/voter/following')
      .then(({ data }) => setFollowing(data.following))
      .finally(() => setLoadingFollowing(false))
  }, [])

  const searchOrgs = useCallback(async (q) => {
    setLoadingOrgs(true)
    try {
      const { data } = await api.get('/api/voter/organisations', { params: { q } })
      setOrgs(data.organisations)
    } catch {
      setOrgs([])
    } finally {
      setLoadingOrgs(false)
    }
  }, [])

  useEffect(() => {
    if (orgQuery) searchOrgs(orgQuery)
    else setOrgs([])
  }, [orgQuery, searchOrgs])

  async function selectOrg(org) {
    setSelectedOrg(org)
    setOrgs([])
    setOrgQuery(org.name)
    setLoadingElections(true)
    setError('')
    try {
      const { data } = await api.get(`/api/voter/organisations/${org.organization_id}/elections`)
      setElections(data)
    } catch {
      setError('Failed to load elections for this organisation')
    } finally {
      setLoadingElections(false)
    }
  }

  function clearOrg() {
    setSelectedOrg(null)
    setOrgQuery('')
    setElections({ upcoming: [], running: [], completed: [] })
  }

  async function handleFollow(org) {
    await api.post(`/api/voter/follow/${org.organization_id}`)
    const { data } = await api.get('/api/voter/following')
    setFollowing(data.following)
  }

  async function handleUnfollow(org) {
    await api.delete(`/api/voter/follow/${org.organization_id}`)
    setFollowing((f) => f.filter((o) => o.organization_id !== org.organization_id))
  }

  const isFollowing = (org) => following.some((f) => f.organization_id === org?.organization_id)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Wallet Banner */}
        {!hasWallet && (
          <WalletBanner onLinked={() => setHasWallet(true)} />
        )}

        <h1 className="text-2xl font-bold text-gray-800 mb-2">Elections</h1>

        {/* Followed orgs */}
        {!loadingFollowing && following.length > 0 && !selectedOrg && (
          <div className="mb-8">
            <p className="text-sm font-semibold text-gray-600 mb-3">Your Organisations</p>
            <div className="space-y-3">
              {following.map((org) => (
                <FollowedOrgCard
                  key={org.organization_id}
                  org={org}
                  onSelect={selectOrg}
                  onUnfollow={handleUnfollow}
                />
              ))}
            </div>
          </div>
        )}

        {/* Org search */}
        <p className="text-sm text-gray-500 mb-3">
          {following.length > 0 ? 'Search for another organisation' : 'Search for your organisation to see its elections'}
        </p>
        <div className="relative mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search organisation (e.g. ABC College)…"
              value={orgQuery}
              onChange={(e) => { setOrgQuery(e.target.value); setSelectedOrg(null) }}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {selectedOrg && (
              <button onClick={clearOrg} className="text-sm text-gray-500 hover:text-gray-700 px-2">
                Clear
              </button>
            )}
          </div>

          {/* Dropdown */}
          {!selectedOrg && orgs.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
              {orgs.map((o) => (
                <div key={o.organization_id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                  <button onClick={() => selectOrg(o)} className="flex-1 text-left">
                    <span className="font-medium text-gray-800 text-sm">{o.name}</span>
                    <span className="text-gray-400 ml-2 text-xs">{o.type}</span>
                  </button>
                  <button
                    onClick={() => isFollowing(o) ? handleUnfollow(o) : handleFollow(o)}
                    className={`text-xs font-medium px-2 py-1 rounded-lg ml-3 ${
                      isFollowing(o)
                        ? 'bg-indigo-100 text-indigo-600'
                        : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                    }`}
                  >
                    {isFollowing(o) ? '✓ Following' : '+ Follow'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Elections for selected org */}
        {loadingElections && <p className="text-gray-500 text-sm">Loading elections…</p>}
        {error && <p className="text-red-500 text-sm">{error}</p>}

        {selectedOrg && !loadingElections && !error && (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-gray-500">
                Showing elections for <span className="font-medium text-gray-800">{selectedOrg.name}</span>
              </p>
              <button
                onClick={() => isFollowing(selectedOrg) ? handleUnfollow(selectedOrg) : handleFollow(selectedOrg)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
                  isFollowing(selectedOrg)
                    ? 'bg-indigo-100 text-indigo-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                }`}
              >
                {isFollowing(selectedOrg) ? '✓ Following' : '+ Follow'}
              </button>
            </div>

            {/* Running Now */}
            {elections.running.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <h2 className="text-sm font-semibold text-gray-700">Running Now ({elections.running.length})</h2>
                </div>
                <div className="grid gap-3">
                  {elections.running.map((e) => <ElectionCard key={e.election_id} election={e} />)}
                </div>
              </div>
            )}

            {/* Upcoming */}
            {elections.upcoming.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <h2 className="text-sm font-semibold text-gray-700">Upcoming ({elections.upcoming.length})</h2>
                </div>
                <div className="grid gap-3">
                  {elections.upcoming.map((e) => <ElectionCard key={e.election_id} election={e} />)}
                </div>
              </div>
            )}

            {/* Completed */}
            {elections.completed.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2 h-2 rounded-full bg-purple-400" />
                  <h2 className="text-sm font-semibold text-gray-700">Completed ({elections.completed.length})</h2>
                </div>
                <div className="grid gap-3">
                  {elections.completed.map((e) => <ElectionCard key={e.election_id} election={e} />)}
                </div>
              </div>
            )}

            {elections.running.length === 0 && elections.upcoming.length === 0 && elections.completed.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No elections found for this organisation.</p>
            )}
          </>
        )}

        {!selectedOrg && !loadingElections && following.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-8">
            Search and select your organisation above to view elections
          </p>
        )}
      </div>
    </div>
  )
}
