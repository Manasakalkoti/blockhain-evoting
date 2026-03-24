import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { castVote } from '../services/castVote'
import { getConnectedAddress, checkHasVoted } from '../services/web3'

export default function VotePage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [election, setElection] = useState(null)
  const [selected, setSelected] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [walletAddress, setWalletAddress] = useState('')
  const [alreadyVoted, setAlreadyVoted] = useState(false)

  useEffect(() => {
    api.get(`/api/voter/elections/${id}`)
      .then(({ data }) => {
        setElection(data.election)
        return data.election
      })
      .then(async (el) => {
        // Check if user has a connected wallet and has already voted on-chain
        const addr = await getConnectedAddress()
        if (addr) {
          setWalletAddress(addr)
          if (el.contract_address) {
            const voted = await checkHasVoted(el.contract_address, addr)
            setAlreadyVoted(voted)
          }
        }
      })
      .catch(() => setError('Failed to load election'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleVote() {
    setSubmitting(true)
    setError('')
    setStatusMsg('')

    const selectedCandidate = election?.candidates?.find(
      (c) => c.candidate_id === selected
    )
    if (!selectedCandidate) {
      setError('Please select a candidate')
      setSubmitting(false)
      return
    }

    try {
      const isPublic = election.visibility_type === 'public'
      const hash = await castVote(
        id,
        election.contract_address,
        selectedCandidate.position,
        isPublic,
        setStatusMsg
      )
      setTxHash(hash)
      setConfirming(false)
    } catch (err) {
      // MetaMask rejection shows as ACTION_REJECTED
      if (err.code === 'ACTION_REJECTED' || err.message?.includes('rejected')) {
        setError('Transaction rejected in MetaMask.')
      } else if (err.response?.data?.message) {
        setError(err.response.data.message)
      } else {
        setError(err.message || 'Vote failed. Please try again.')
      }
      setConfirming(false)
    } finally {
      setSubmitting(false)
      setStatusMsg('')
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (txHash) {
    const explorerBase = 'https://sepolia.etherscan.io/tx/'
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-xl mx-auto px-4 py-16 text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Vote Cast!</h1>
            <p className="text-gray-500 mb-6 text-sm">
              Your vote has been permanently recorded on the Ethereum blockchain.
            </p>
            <div className="bg-gray-50 rounded-lg p-3 mb-6 text-left">
              <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide font-medium">Transaction Hash</p>
              <p className="font-mono text-xs text-gray-700 break-all">{txHash}</p>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href={`${explorerBase}${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="w-full bg-indigo-50 text-indigo-700 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100 text-center"
              >
                View on Etherscan (Sepolia)
              </a>
              <button
                onClick={() => navigate(`/results/${id}`)}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
              >
                View Results
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <p className="p-8 text-gray-500">Loading…</p>
    </div>
  )

  if (error && !election) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <p className="p-8 text-red-500">{error}</p>
    </div>
  )

  const selectedCandidate = election?.candidates?.find((c) => c.candidate_id === selected)
  const hasContract = Boolean(election?.contract_address)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Cast Your Vote</h1>
        <p className="text-sm text-gray-500 mb-2">{election?.title}</p>

        {/* Wallet status banner */}
        {walletAddress ? (
          <div className="mb-4 text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" />
            Wallet connected: <span className="font-mono">{walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}</span>
          </div>
        ) : (
          <div className="mb-4 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2">
            MetaMask not connected — your wallet will be requested when you confirm your vote.
          </div>
        )}

        {/* Already voted warning */}
        {alreadyVoted && (
          <div className="mb-4 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">
            Your wallet has already voted in this election on-chain.
          </div>
        )}

        {/* No contract warning */}
        {!hasContract && (
          <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3">
            This election has not been deployed to the blockchain yet. Contact the admin.
          </div>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>
        )}

        {/* Candidate list */}
        <div className="grid gap-3 mb-6">
          {(election?.candidates || []).map((c) => (
            <button
              key={c.candidate_id}
              onClick={() => !alreadyVoted && setSelected(c.candidate_id)}
              disabled={alreadyVoted || !hasContract}
              className={`w-full text-left rounded-xl border p-4 flex items-center gap-4 transition ${
                selected === c.candidate_id
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                  : 'border-gray-200 bg-white hover:border-indigo-300'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
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
          disabled={!selected || alreadyVoted || !hasContract}
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
              <p className="text-sm text-gray-500 mb-2">
                You are voting for{' '}
                <span className="font-semibold text-gray-800">{selectedCandidate?.candidate_name}</span>.
                This action cannot be undone.
              </p>
              <p className="text-xs text-gray-400 mb-4">
                MetaMask will open to sign the transaction. The vote is sent directly from your wallet
                — the backend cannot alter it.
              </p>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              {statusMsg && (
                <div className="text-xs text-indigo-600 bg-indigo-50 rounded px-3 py-2 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {statusMsg}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setConfirming(false); setError('') }}
                  disabled={submitting}
                  className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVote}
                  disabled={submitting}
                  className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Signing…' : 'Confirm & Sign'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
