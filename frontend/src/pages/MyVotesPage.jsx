import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'

function downloadReceipt(vote, user) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>Vote Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: white; width: 480px; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
    .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 32px 28px; }
    .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .header p { font-size: 13px; opacity: 0.8; }
    .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.2); border-radius: 999px; padding: 4px 12px; font-size: 12px; margin-top: 12px; }
    .body { padding: 28px; }
    .row { display: flex; flex-direction: column; gap: 4px; margin-bottom: 20px; }
    .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #9ca3af; }
    .value { font-size: 14px; color: #111827; font-weight: 500; word-break: break-all; }
    .mono { font-family: 'Courier New', monospace; font-size: 12px; color: #4f46e5; }
    .divider { height: 1px; background: #f3f4f6; margin: 8px 0 20px; }
    .footer { background: #f9fafb; padding: 16px 28px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
    @media print { body { background: white; } .card { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Vote Receipt</h1>
      <p>E-Voting Platform — Blockchain Verified</p>
      <div class="badge">✓ Verified on Ethereum</div>
    </div>
    <div class="body">
      <div class="row">
        <span class="label">Voter</span>
        <span class="value">${user?.full_name || 'Voter'}</span>
      </div>
      <div class="row">
        <span class="label">Election</span>
        <span class="value">${vote.election_title}</span>
      </div>
      ${vote.org_name ? `
      <div class="row">
        <span class="label">Organisation</span>
        <span class="value">${vote.org_name}</span>
      </div>` : ''}
      <div class="row">
        <span class="label">Voted At</span>
        <span class="value">${new Date(vote.voted_at).toLocaleString()}</span>
      </div>
      <div class="divider"></div>
      <div class="row">
        <span class="label">Wallet Address</span>
        <span class="value mono">${vote.wallet_address}</span>
      </div>
      <div class="row">
        <span class="label">Transaction Hash</span>
        <span class="value mono">${vote.blockchain_tx_hash}</span>
      </div>
      ${vote.contract_address ? `
      <div class="row">
        <span class="label">Smart Contract</span>
        <span class="value mono">${vote.contract_address}</span>
      </div>` : ''}
    </div>
    <div class="footer">
      This receipt is cryptographically verifiable on the Ethereum blockchain.<br/>
      The transaction hash above is your immutable proof of vote.
    </div>
  </div>
  <script>window.onload = () => window.print()</script>
</body>
</html>`

  const w = window.open('', '_blank', 'width=560,height=720')
  w.document.write(html)
  w.document.close()
}

export default function MyVotesPage() {
  const { user } = useAuth()
  const [votes, setVotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/voter/my-votes')
      .then(({ data }) => setVotes(data.votes))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">My Vote History</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every vote you cast is permanently recorded on the blockchain.
          </p>
        </div>

        {loading && <p className="text-gray-400 text-sm">Loading…</p>}

        {!loading && votes.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🗳️</p>
            <p className="text-gray-500">You haven't voted in any elections yet.</p>
            <Link to="/" className="text-sm text-indigo-600 hover:underline mt-2 inline-block">
              Browse elections →
            </Link>
          </div>
        )}

        {!loading && votes.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400">{votes.length} vote{votes.length !== 1 ? 's' : ''} recorded</p>
            {votes.map((vote) => (
              <div key={vote.blockchain_tx_hash}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        vote.election_status === 'active' ? 'bg-green-100 text-green-700' :
                        vote.election_status === 'completed' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {vote.election_status}
                      </span>
                      {vote.org_name && (
                        <span className="text-xs text-gray-400">{vote.org_name}</span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-800 text-sm truncate">{vote.election_title}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      Voted on {new Date(vote.voted_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {vote.election_status === 'completed' && (
                      <Link
                        to={`/results/${vote.election_id}`}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Results →
                      </Link>
                    )}
                    <button
                      onClick={() => downloadReceipt(vote, user)}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                    >
                      Receipt ↓
                    </button>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-50">
                  <p className="text-xs text-gray-400 mb-1">Transaction Hash</p>
                  <p className="font-mono text-xs text-indigo-600 break-all">
                    {vote.blockchain_tx_hash}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
