import { useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth'
import { auth } from '../firebase'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

export default function LoginPage() {
  const [step, setStep] = useState('phone') // 'phone' | 'otp'
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const confirmationRef = useRef(null)
  const recaptchaRef = useRef(null)
  const { login } = useAuth()
  const navigate = useNavigate()

  function clearRecaptcha() {
    if (recaptchaRef.current) {
      recaptchaRef.current.clear()
      recaptchaRef.current = null
    }
  }

  function setupRecaptcha() {
    clearRecaptcha()
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    })
    return recaptchaRef.current
  }

  async function handleSendOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const verifier = setupRecaptcha()
      const result = await signInWithPhoneNumber(auth, phone, verifier)
      confirmationRef.current = result
      setStep('otp')
    } catch (err) {
      setError(err.message || 'Failed to send OTP')
      clearRecaptcha()
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await confirmationRef.current.confirm(otp)
      const idToken = await result.user.getIdToken()
      const { data } = await api.post('/api/auth/verify-otp', { id_token: idToken })
      login(data.user, data.token)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Voter Login</h1>
        <p className="text-sm text-gray-500 mb-6">
          {step === 'phone' ? 'Enter your registered phone number' : `Enter the OTP sent to ${phone}`}
        </p>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{error}</div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <input
              type="tel"
              placeholder="+91 9876543210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div id="recaptcha-container" />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <input
              type="text"
              placeholder="6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              onClick={() => { setStep('phone'); setOtp(''); clearRecaptcha() }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Change number
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Admin?{' '}
          <Link to="/admin/login" className="text-indigo-600 hover:underline">
            Login here
          </Link>
        </p>
      </div>
    </div>
  )
}
