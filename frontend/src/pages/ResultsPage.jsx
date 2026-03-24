import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { fetchResultsFromChain } from '../services/getResults'

const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io'

export default function ResultsPage() {
  const { id } = useParams()
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chainCounts, setChainCounts] = useState(null)  // on-chain tallies if available

  useEffect(() => {
    api.get(`/api/voter/elections/${id}/results`)
      .then(({ data }) => {
        setResults(data)
        // Attempt to also fetch directly from the smart contract (read-only, free)
        if (data.contract_address) {
          fetchResultsFromChain(data.contract_address)
            .then((onChain) => setChainCounts(onChain))
            .catch(() => setChainCounts(null))  // silently fail if node not reachable
        }
      })
      .catch(() => setError('Failed to load results'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <p className="p-8 text-gray-500">Loading results…</p>
    </div>
  )
  if (error) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <p className="p-8 text-red-500">{error}</p>
    </div>
  )

  // Merge on-chain counts into candidates if available
  const candidates = (results?.candidates || []).map((c) => {
    const onChain = chainCounts?.find((x) => x.candidateId === c.position)
    return { ...c, votes: onChain?.votes ?? c.votes }
  })

  const maxVotes = Math.max(...candidates.map((c) => c.votes), 1)
  const winner = candidates.reduce(
    (a, b) => (a.votes > b.votes ? a : b),
    candidates[0]
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Results</h1>
        <p className="text-sm text-gray-500 mb-6">{results?.title}</p>

        {/* Blockchain source badge */}
        {results?.contract_address && (
          <div className="mb-4 flex items-center gap-2 text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
            Smart Contract:&nbsp;
            <a
              href={`${SEPOLIA_EXPLORER}/address/${results.contract_address}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono hover:underline"
            >
              {results.contract_address.slice(0, 10)}…{results.contract_address.slice(-6)}
            </a>
            {chainCounts && (
              <span className="ml-auto text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                Live on-chain
              </span>
            )}
          </div>
        )}

        {/* Vote tally bar chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
            Vote Tally
            {chainCounts ? ' (from blockchain)' : ' (from database)'}
          </h2>
          <p className="text-xs text-gray-400 mb-4">
            Total votes recorded: {results?.total_votes ?? candidates.reduce((s, c) => s + c.votes, 0)}
          </p>
          <div className="space-y-4">
            {candidates.map((c) => (
              <div key={c.candidate_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={`font-medium ${c.candidate_id === winner?.candidate_id ? 'text-indigo-600' : 'text-gray-700'}`}>
                    {c.candidate_name}
                    {c.candidate_id === winner?.candidate_id && (
                      <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                        Winner
                      </span>
                    )}
                  </span>
                  <span className="text-gray-500">{c.votes} votes</span>
                </div>
                {c.party_name && (
                  <p className="text-xs text-gray-400 mb-1">{c.party_name}</p>
                )}
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${c.candidate_id === winner?.candidate_id ? 'bg-indigo-500' : 'bg-gray-300'}`}
                    style={{ width: `${maxVotes > 0 ? (c.votes / maxVotes) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transparency section */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Transparency Proofs
          </h2>
          <div className="space-y-2 text-sm text-gray-600">
            {results?.contract_address && (
              <div className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5">①</span>
                <span>
                  Smart contract:{' '}
                  <a
                    href={`${SEPOLIA_EXPLORER}/address/${results.contract_address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 font-mono text-xs hover:underline"
                  >
                    {results.contract_address}
                  </a>
                </span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5">②</span>
              <span>
                Each vote is permanently recorded as an Ethereum transaction. Click any hash below to audit independently.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-gray-400 mt-0.5">③</span>
              <span>
                The Merkle root in the contract guarantees only eligible voters participated.
              </span>
            </div>
          </div>
        </div>

        {/* Vote audit log */}
        {results?.transactions?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
              Vote Audit Log ({results.transactions.length} votes)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">TX Hash</th>
                    <th className="pb-2 font-medium">Cast At</th>
                    <th className="pb-2 font-medium">Verify</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {results.transactions.map((tx) => (
                    <tr key={tx.blockchain_tx_hash}>
                      <td className="py-2 font-mono text-xs text-gray-500 truncate max-w-xs">
                        {tx.blockchain_tx_hash.slice(0, 14)}…{tx.blockchain_tx_hash.slice(-8)}
                      </td>
                      <td className="py-2 text-gray-500 whitespace-nowrap text-xs">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2">
                        <a
                          href={`${SEPOLIA_EXPLORER}/tx/${tx.blockchain_tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline text-xs"
                        >
                          Etherscan ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {results?.transactions?.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No votes recorded yet.</p>
        )}
      </div>
    </div>
  )
}
