import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'

export default function ResultsPage() {
  const { id } = useParams()
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get(`/api/elections/${id}/results`)
      .then(({ data }) => setResults(data))
      .catch(() => setError('Failed to load results'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-gray-500">Loading…</p></div>
  if (error) return <div className="min-h-screen bg-gray-50"><Navbar /><p className="p-8 text-red-500">{error}</p></div>

  const candidates = results?.candidates || []
  const maxVotes = Math.max(...candidates.map((c) => c.votes), 1)
  const winner = candidates.reduce((a, b) => (a.votes > b.votes ? a : b), candidates[0])

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Results</h1>
        <p className="text-sm text-gray-500 mb-6">{results?.title}</p>

        {/* Bar chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Vote Tally</h2>
          <div className="space-y-4">
            {candidates.map((c) => (
              <div key={c.candidate_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className={`font-medium ${c.candidate_id === winner?.candidate_id ? 'text-indigo-600' : 'text-gray-700'}`}>
                    {c.candidate_name}
                    {c.candidate_id === winner?.candidate_id && (
                      <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">Winner</span>
                    )}
                  </span>
                  <span className="text-gray-500">{c.votes} votes</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${c.candidate_id === winner?.candidate_id ? 'bg-indigo-500' : 'bg-gray-300'}`}
                    style={{ width: `${(c.votes / maxVotes) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Audit table */}
        {results?.transactions?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">Vote Audit Log</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="pb-2 font-medium">TX Hash</th>
                    <th className="pb-2 font-medium">Cast At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {results.transactions.map((tx) => (
                    <tr key={tx.blockchain_tx_hash}>
                      <td className="py-2 font-mono text-xs text-gray-500 truncate max-w-xs">
                        {tx.blockchain_tx_hash}
                      </td>
                      <td className="py-2 text-gray-500 whitespace-nowrap">
                        {new Date(tx.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
