import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
}

export default function ElectionsPage() {
  const [elections, setElections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/elections')
      .then(({ data }) => setElections(data.elections || []))
      .catch(() => setError('Failed to load elections'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Elections</h1>

        {loading && <p className="text-gray-500">Loading…</p>}
        {error && <p className="text-red-500">{error}</p>}

        {!loading && !error && elections.length === 0 && (
          <p className="text-gray-500">No elections available.</p>
        )}

        <div className="grid gap-4">
          {elections.map((election) => (
            <Link
              key={election.election_id}
              to={`/elections/${election.election_id}`}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-800">{election.title}</h2>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">{election.description}</p>
                  <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
                    <span>{new Date(election.start_time).toLocaleString()}</span>
                    <span>→</span>
                    <span>{new Date(election.end_time).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[election.status] || STATUS_STYLES.draft}`}>
                    {election.status}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                    {election.visibility_type}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
