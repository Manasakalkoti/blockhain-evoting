import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import api from '../../api/client'

export default function SuperAdminDashboardPage() {
  const { user, logout } = useAuth()
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showFollowers, setShowFollowers] = useState(false)

  // Add member form state
  const [showAdminForm, setShowAdminForm] = useState(false)
  const [memberForm, setMemberForm] = useState({ full_name: '', email: '', password: '' })
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  useEffect(() => {
    fetchOrg()
  }, [])

  async function fetchOrg() {
    try {
      const { data } = await api.get('/api/org/me')
      setOrg(data)
    } catch {
      setError('Failed to load organisation details')
    } finally {
      setLoading(false)
    }
  }

  function handleMemberChange(e) {
    setMemberForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleAddMember(role) {
    setFormError('')
    setFormSuccess('')
    setFormLoading(true)
    try {
      const endpoint = role === 'admin' ? '/api/org/admins' : '/api/org/rc-members'
      await api.post(endpoint, memberForm)
      setFormSuccess(`${role === 'admin' ? 'Admin' : 'RC Member'} added successfully`)
      setMemberForm({ full_name: '', email: '', password: '' })
      setShowAdminForm(false)
      setShowRcForm(false)
      fetchOrg()
    } catch (err) {
      setFormError(err.response?.data?.message || 'Failed to add member')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleRemove(userId, name) {
    if (!window.confirm(`Remove ${name} from the organisation?`)) return
    try {
      await api.delete(`/api/org/members/${userId}`)
      fetchOrg()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to remove member')
    }
  }

  async function handleDeleteOrg() {
    if (!window.confirm(
      `Are you sure you want to delete "${org?.organization?.name}"?\n\n` +
      `• All admins will be suspended\n` +
      `• Organisation will be hidden from voters\n` +
      `• Historical election data is preserved on blockchain\n\n` +
      `This cannot be undone.`
    )) return
    if (!window.confirm('Final confirmation: Delete the organisation?')) return
    try {
      await api.delete('/api/org/me')
      alert('Organisation deleted. You will now be logged out.')
      logout()
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete organisation')
    }
  }

  if (loading) return <div className="p-8 text-gray-500">Loading…</div>
  if (error) return <div className="p-8 text-red-500">{error}</div>

  const { organization, admins, elections, followers } = org

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-gray-800">{organization.name}</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-gray-500">{organization.type} · {user.email}</p>
            <button
              onClick={() => setShowFollowers((v) => !v)}
              className="text-xs text-indigo-600 hover:underline font-medium"
            >
              {organization.follower_count} Follower{organization.follower_count !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
        <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">Sign out</button>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {formSuccess && (
          <div className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-2">{formSuccess}</div>
        )}

        {/* Followers panel */}
        {showFollowers && (
          <section className="bg-white rounded-2xl border border-indigo-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-800">
                Followers
                <span className="ml-2 text-sm font-normal text-gray-400">({followers.length})</span>
              </h2>
              <button onClick={() => setShowFollowers(false)} className="text-xs text-gray-400 hover:text-gray-600">
                Close
              </button>
            </div>
            {followers.length === 0 ? (
              <p className="text-sm text-gray-400">No followers yet. Voters will appear here once they follow your organisation.</p>
            ) : (
              <div className="space-y-2">
                {followers.map((f) => (
                  <div key={f.user_id} className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-600 shrink-0">
                      {f.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{f.full_name}</p>
                      <p className="text-xs text-gray-400">{f.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Admins */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-gray-800">Admins</h2>
            <button
              onClick={() => { setShowAdminForm(!showAdminForm); setFormError(''); setFormSuccess('') }}
              className="text-sm text-indigo-600 hover:underline"
            >
              {showAdminForm ? 'Cancel' : '+ Add Admin'}
            </button>
          </div>

          {showAdminForm && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-3">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <input name="full_name" placeholder="Full name" value={memberForm.full_name}
                onChange={handleMemberChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input name="email" type="email" placeholder="Email" value={memberForm.email}
                onChange={handleMemberChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <input name="password" type="password" placeholder="Temporary password" value={memberForm.password}
                onChange={handleMemberChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <button onClick={() => handleAddMember('admin')} disabled={formLoading}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                {formLoading ? 'Creating…' : 'Create Admin'}
              </button>
            </div>
          )}

          {admins.length === 0 ? (
            <p className="text-sm text-gray-400">No admins yet.</p>
          ) : (
            <div className="space-y-2">
              {admins.map((a) => (
                <div key={a.user_id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{a.full_name}</p>
                    <p className="text-xs text-gray-500">{a.email}</p>
                  </div>
                  <button onClick={() => handleRemove(a.user_id, a.full_name)}
                    className="text-xs text-red-500 hover:underline">Remove</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger Zone */}
        <section className="border border-red-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-red-700 mb-1">Danger Zone</h2>
          <p className="text-sm text-gray-500 mb-4">
            Deleting your organisation will suspend all admins and hide it from voters.
            On-chain election data is permanent and cannot be removed.
            This action cannot be undone.
          </p>
          <button
            onClick={handleDeleteOrg}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
          >
            Delete Organisation
          </button>
        </section>

        {/* Elections */}
        <section>
          <h2 className="text-base font-semibold text-gray-800 mb-4">Elections under {organization.name}</h2>
          {elections.length === 0 ? (
            <p className="text-sm text-gray-400">No elections yet. Your admins can create them.</p>
          ) : (
            <div className="space-y-2">
              {elections.map((e) => (
                <div key={e.election_id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-800">{e.title}</p>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    e.status === 'active' ? 'bg-green-100 text-green-700' :
                    e.status === 'completed' ? 'bg-gray-100 text-gray-600' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {e.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
