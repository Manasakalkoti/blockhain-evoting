import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import api from '../../api/client'

const STATUS_STYLES = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
}

export default function AdminElectionsPage() {
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
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Elections</h1>
          <Link
            to="/admin/elections/new"
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            + New Election
          </Link>
        </div>

        {loading && <p className="text-gray-500">Loading…</p>}
        {error && <p className="text-red-500">{error}</p>}

        {!loading && !error && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Title</th>
                  <th className="px-5 py-3 text-left font-medium">Type</th>
                  <th className="px-5 py-3 text-left font-medium">Status</th>
                  <th className="px-5 py-3 text-left font-medium">Start</th>
                  <th className="px-5 py-3 text-left font-medium">End</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {elections.map((e) => (
                  <tr key={e.election_id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-800">{e.title}</td>
                    <td className="px-5 py-3 text-gray-500 capitalize">{e.visibility_type}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[e.status]}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{new Date(e.start_time).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-gray-500">{new Date(e.end_time).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/admin/elections/${e.election_id}`}
                        className="text-indigo-600 hover:underline text-xs"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
                {elections.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-gray-400">
                      No elections yet.{' '}
                      <Link to="/admin/elections/new" className="text-indigo-600 hover:underline">Create one</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
