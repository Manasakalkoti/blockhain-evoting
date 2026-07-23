import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const PROFILES = [
  {
    role: 'voter',
    label: 'Voter',
    description: 'Search organisations and cast your vote',
    icon: '🗳️',
    route: '/',
  },
  {
    role: 'super_admin',
    label: 'Organisation',
    description: 'Manage your organisation and admins',
    icon: '🏛️',
    route: '/org/dashboard',
  },
  {
    role: 'admin',
    label: 'Admin',
    description: 'Create and manage elections',
    icon: '⚙️',
    route: '/admin/elections',
  },
]

export default function ProfilePickerPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handlePick(profile) {
    if (user?.role !== profile.role) return
    navigate(profile.route)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-bold text-gray-800 mb-1 text-center">
          Welcome, {user?.full_name}
        </h1>
        <p className="text-sm text-gray-500 mb-8 text-center">Choose your profile to continue</p>

        <div className="grid grid-cols-2 gap-4">
          {PROFILES.map((profile) => {
            const active = user?.role === profile.role
            return (
              <button
                key={profile.role}
                onClick={() => handlePick(profile)}
                disabled={!active}
                className={`
                  rounded-2xl p-6 text-left border-2 transition-all
                  ${active
                    ? 'border-indigo-500 bg-white shadow-md hover:shadow-lg cursor-pointer'
                    : 'border-gray-100 bg-gray-50 opacity-40 cursor-not-allowed'
                  }
                `}
              >
                <div className="text-3xl mb-3">{profile.icon}</div>
                <p className="font-semibold text-gray-800 text-sm">{profile.label}</p>
                <p className="text-xs text-gray-500 mt-1">{profile.description}</p>
                {active && (
                  <span className="inline-block mt-3 text-xs text-indigo-600 font-medium">
                    Your profile →
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <button
          onClick={logout}
          className="mt-8 w-full text-sm text-gray-400 hover:text-gray-600 hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
