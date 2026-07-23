import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'

const POLL_INTERVAL = 10000 // 10 seconds while live

export default function ResultsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const intervalRef = useRef(null)

  async function fetchResults() {
    try {
      const { data } = await api.get(`/api/voter/elections/${id}/results`)
      setResults(data)
      setLastUpdated(new Date())
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load results')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResults()
  }, [id])

  // Poll every 10 seconds when election is live
  useEffect(() => {
    if (results?.is_live) {
      intervalRef.current = setInterval(fetchResults, POLL_INTERVAL)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [results?.is_live])

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <p className="p-8 text-gray-500">Loading results…</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">🔒</p>
        <p className="text-gray-600 font-medium">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-indigo-600 hover:underline">Go back</button>
      </div>
    </div>
  )

  const candidates = results?.candidates || []
  const totalVotes = results?.total_votes ?? 0
  const maxVotes = Math.max(...candidates.map((c) => c.votes), 1)
  const winner = totalVotes > 0
    ? candidates.reduce((a, b) => (a.votes > b.votes ? a : b), candidates[0])
    : null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Title + live badge */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{results?.title}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {results?.is_live ? 'Live counting in progress' : 'Final results'}
            </p>
          </div>
          {results?.is_live && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-full">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              LIVE
            </div>
          )}
        </div>

        {/* Total votes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 mb-4 flex items-center justify-between">
          <div>
            <p className="text-3xl font-bold text-gray-800">{totalVotes.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Total votes cast</p>
          </div>
          {lastUpdated && results?.is_live && (
            <p className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString()} · refreshes every 10s
            </p>
          )}
        </div>

        {/* Vote tally */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-5">
            Vote Tally
          </h2>
          <div className="space-y-5">
            {candidates.map((c) => {
              const pct = totalVotes > 0 ? ((c.votes / totalVotes) * 100).toFixed(1) : '0.0'
              const isWinner = winner && c.candidate_id === winner.candidate_id && !results?.is_live
              return (
                <div key={c.candidate_id}>
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${isWinner ? 'text-indigo-700' : 'text-gray-800'}`}>
                        {c.candidate_name}
                      </span>
                      {isWinner && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                          Winner
                        </span>
                      )}
                      {c.party_name && (
                        <span className="text-xs text-gray-400">{c.party_name}</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-semibold text-gray-700">{c.votes.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                    </div>
                  </div>
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        isWinner ? 'bg-indigo-500' :
                        results?.is_live ? 'bg-blue-400' : 'bg-gray-300'
                      }`}
                      style={{ width: `${(c.votes / maxVotes) * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Blockchain verification */}
        {results?.contract_address && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Blockchain Verification
            </h2>
            <div className="space-y-3 text-sm text-gray-600">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-lg">⛓️</span>
                <div>
                  <p className="font-medium text-gray-700 mb-0.5">Smart Contract</p>
                  <p className="font-mono text-xs text-gray-500 break-all">{results.contract_address}</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-lg">🔒</span>
                <div>
                  <p className="font-medium text-gray-700 mb-0.5">Tamper-proof</p>
                  <p className="text-xs text-gray-500">Each vote is an Ethereum transaction. Once recorded, no one — including the admin — can alter it.</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-lg">✅</span>
                <div>
                  <p className="font-medium text-gray-700 mb-0.5">Publicly Verifiable</p>
                  <p className="text-xs text-gray-500">Any voter can independently verify the results by calling <span className="font-mono">getResults()</span> on the contract.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audit log */}
        {results?.transactions?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Vote Audit Log
              <span className="ml-2 text-xs text-gray-400 normal-case font-normal">
                {results.transactions.length} transactions on-chain
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100 text-xs">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">TX Hash</th>
                    <th className="pb-2 font-medium">Wallet</th>
                    <th className="pb-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {results.transactions.map((tx, i) => (
                    <tr key={tx.blockchain_tx_hash}>
                      <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2 font-mono text-xs text-gray-500">
                        {tx.blockchain_tx_hash.slice(0, 10)}…{tx.blockchain_tx_hash.slice(-6)}
                      </td>
                      <td className="py-2 font-mono text-xs text-gray-500">
                        {tx.wallet_address.slice(0, 8)}…{tx.wallet_address.slice(-4)}
                      </td>
                      <td className="py-2 text-xs text-gray-400 whitespace-nowrap">
                        {new Date(tx.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {totalVotes === 0 && !results?.is_live && (
          <p className="text-sm text-gray-400 text-center py-8">No votes were cast in this election.</p>
        )}
      </div>
    </div>
  )
}
