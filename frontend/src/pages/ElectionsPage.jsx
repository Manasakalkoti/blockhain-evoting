import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'

const VERIF_BADGE = {
  verified: 'bg-green-100 text-green-700',
  not_eligible: 'bg-red-100 text-red-600',
}

function ElectionCard({ election }) {
  const verif = election.verification_status

  return (
    <Link
      to={`/elections/${election.election_id}`}
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition block"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-800 truncate">{election.title}</h3>
          {election.description && (
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">{election.description}</p>
          )}
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
            <span>{new Date(election.start_time).toLocaleString()}</span>
            <span>→</span>
            <span>{new Date(election.end_time).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            election.visibility_type === 'public'
              ? 'bg-indigo-50 text-indigo-600'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {election.visibility_type}
          </span>

          {verif && (
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${VERIF_BADGE[verif]}`}>
              {verif === 'verified' ? 'Verified' : 'Not Eligible'}
            </span>
          )}

          {!verif && election.status !== 'completed' && (
            <span className="text-xs px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 font-medium">
              Not Verified
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function Section({ title, color, elections, emptyText }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        <h2 className="text-base font-semibold text-gray-700">{title}</h2>
        <span className="text-xs text-gray-400">({elections.length})</span>
      </div>
      {elections.length === 0 ? (
        <p className="text-sm text-gray-400 pl-4">{emptyText}</p>
      ) : (
        <div className="grid gap-3">
          {elections.map((e) => (
            <ElectionCard key={e.election_id} election={e} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function ElectionsPage() {
  const [data, setData] = useState({ upcoming: [], running: [], completed: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/api/voter/elections')
      .then(({ data }) => setData(data))
      .catch(() => setError('Failed to load elections'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">My Elections</h1>

        {loading && <p className="text-gray-500">Loading…</p>}
        {error && <p className="text-red-500">{error}</p>}

        {!loading && !error && (
          <>
            <Section
              title="Running Now"
              color="bg-green-500"
              elections={data.running}
              emptyText="No active elections right now."
            />
            <Section
              title="Upcoming"
              color="bg-blue-500"
              elections={data.upcoming}
              emptyText="No upcoming elections scheduled."
            />
            <Section
              title="Completed"
              color="bg-purple-400"
              elections={data.completed}
              emptyText="No completed elections yet."
            />
          </>
        )}
      </div>
    </div>
  )
}
