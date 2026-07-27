import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

// step: 'credentials' | 'otp'
export default function LoginPage() {
  const [step, setStep] = useState('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  async function handleCredentials(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/login', { email, password })
      setStep('otp')
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/verify-otp', { email, otp })
      login(data.user, data.token)
      navigate('/profile')
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">

        {/* Platform name */}
        <h1 className="text-2xl font-bold text-gray-800 mb-1">E-Voting Platform</h1>
        <p className="text-sm text-gray-500 mb-6">
          {step === 'credentials' ? 'Sign in to continue' : `Enter the OTP sent to ${email}`}
        </p>

        {/* Role info tiles */}
        {step === 'credentials' && (
          <div className="grid grid-cols-3 gap-2 mb-6">
            {[
              { label: 'Voter', desc: 'Cast your vote' },
              { label: 'Organisation', desc: 'Manage your org' },
              { label: 'Admin', desc: 'Run elections' },
            ].map((r) => (
              <div key={r.label} className="border border-gray-100 rounded-lg p-2 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700">{r.label}</p>
                <p className="text-xs text-gray-400">{r.desc}</p>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>
        )}

        {step === 'credentials' ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtp} className="space-y-4">
            <input
              type="text"
              placeholder="6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Verifying…' : 'Verify OTP'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('credentials'); setOtp(''); setError('') }}
              className="w-full text-sm text-gray-500 hover:underline"
            >
              Back
            </button>
          </form>
        )}

        <div className="mt-6 space-y-2 text-center text-sm text-gray-500">
          <p>
            New voter?{' '}
            <Link to="/register" className="text-indigo-600 hover:underline">Register here</Link>
          </p>
          <p>
            Registering an organisation?{' '}
            <Link to="/org/register" className="text-indigo-600 hover:underline">Click here</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
