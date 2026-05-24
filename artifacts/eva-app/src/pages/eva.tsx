import { useState } from 'react'
import { useGetFeed, usePublishPost, useVerifyPost } from '@workspace/api-client-react'

declare global {
  interface Window {
    aptos?: {
      connect: () => Promise<{ address: string }>
    }
  }
}

export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')

  // Publish state
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [hash, setHash] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)
  const [publishStatus, setPublishStatus] = useState<string | null>(null)

  // Verify state
  const [verifyHash, setVerifyHash] = useState('')
  const [verifyResult, setVerifyResult] = useState<{ found: boolean; post: unknown } | null>(null)

  const feedQuery = useGetFeed({ query: { enabled: tab === 'feed' } })
  const publishMutation = usePublishPost()
  const verifyMutation = useVerifyPost()

  const generateHash = async () => {
    const msg = author + title + body
    const enc = new TextEncoder().encode(msg)
    const buf = await crypto.subtle.digest('SHA-256', enc)
    const arr = Array.from(new Uint8Array(buf))
    setHash('sha256:' + arr.map(b => b.toString(16).padStart(2, '0')).join(''))
  }

  const connectWallet = async () => {
    if (!window.aptos) {
      alert('Install Petra Wallet')
      return
    }
    try {
      const res = await window.aptos.connect()
      setWallet(res.address)
    } catch {
      alert('Connection cancelled')
    }
  }

  const handlePublish = () => {
    if (!author || !title || !body || !hash) {
      alert('Please fill in all fields and generate a hash first.')
      return
    }
    setPublishStatus(null)
    publishMutation.mutate(
      { data: { author, title, body, hash, signature: null, walletAddress: wallet } },
      {
        onSuccess: () => {
          setPublishStatus('Published successfully!')
          setAuthor('')
          setTitle('')
          setBody('')
          setHash('')
        },
        onError: (err: unknown) => {
          setPublishStatus('Error: ' + (err instanceof Error ? err.message : 'Failed to publish'))
        },
      }
    )
  }

  const handleVerify = () => {
    if (!verifyHash.trim()) return
    setVerifyResult(null)
    verifyMutation.mutate(
      { data: { hash: verifyHash.trim() } },
      {
        onSuccess: (data) => {
          setVerifyResult(data as { found: boolean; post: unknown })
        },
        onError: () => {
          setVerifyResult({ found: false, post: null })
        },
      }
    )
  }

  const activeBtn = { fontWeight: 'bold' as const, textDecoration: 'underline' }
  const inactiveBtn = {}

  return (
    <div style={{ padding: 30, fontFamily: 'Arial', maxWidth: 640 }}>
      <h1>EVA 🚀</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setTab('publish')} style={tab === 'publish' ? activeBtn : inactiveBtn}>Publish</button>
        <button onClick={() => setTab('verify')} style={tab === 'verify' ? activeBtn : inactiveBtn}>Verify</button>
        <button onClick={() => setTab('feed')} style={tab === 'feed' ? activeBtn : inactiveBtn}>Feed</button>
      </div>

      {/* ── Publish ── */}
      {tab === 'publish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Publish</h2>

          <button onClick={connectWallet}>
            {wallet ? `✓ Connected: ${wallet.slice(0, 8)}…${wallet.slice(-6)}` : 'Connect Petra Wallet'}
          </button>

          <input
            placeholder="Author"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            style={{ padding: 8, fontSize: 14 }}
          />
          <input
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            style={{ padding: 8, fontSize: 14 }}
          />
          <textarea
            placeholder="Content"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            style={{ padding: 8, fontSize: 14 }}
          />

          <button onClick={generateHash} disabled={!author || !title || !body}>
            Generate SHA-256
          </button>

          {hash && (
            <p style={{ wordBreak: 'break-all', fontSize: 13, background: '#f5f5f5', padding: 8, borderRadius: 4, margin: 0 }}>
              {hash}
            </p>
          )}

          <button
            onClick={handlePublish}
            disabled={publishMutation.isPending || !hash}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            {publishMutation.isPending ? 'Publishing…' : 'Publish to Shelby'}
          </button>

          {publishStatus && (
            <p style={{ margin: 0, color: publishStatus.startsWith('Error') ? 'red' : 'green' }}>
              {publishStatus}
            </p>
          )}
        </div>
      )}

      {/* ── Verify ── */}
      {tab === 'verify' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Verify Authorship</h2>
          <p style={{ margin: 0, color: '#555', fontSize: 14 }}>
            Paste a SHA-256 hash to check whether a matching published post exists.
          </p>

          <textarea
            placeholder="sha256:abc123…"
            value={verifyHash}
            onChange={e => setVerifyHash(e.target.value)}
            rows={3}
            style={{ padding: 8, fontSize: 13, fontFamily: 'monospace' }}
          />

          <button
            onClick={handleVerify}
            disabled={verifyMutation.isPending || !verifyHash.trim()}
          >
            {verifyMutation.isPending ? 'Checking…' : 'Verify Hash'}
          </button>

          {verifyResult !== null && (
            verifyResult.found
              ? (() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const p = verifyResult.post as any
                  return (
                    <div style={{ background: '#f0fff4', border: '1px solid #86efac', borderRadius: 6, padding: 12 }}>
                      <p style={{ margin: '0 0 6px', color: '#166534', fontWeight: 'bold' }}>✓ Verified — post found</p>
                      <p style={{ margin: '0 0 4px' }}><strong>{p.title}</strong></p>
                      <p style={{ margin: '0 0 4px', fontSize: 13 }}>by {p.author} · {new Date(p.date).toLocaleString()}</p>
                      <p style={{ margin: '0 0 4px', fontSize: 13 }}>{p.body}</p>
                      {p.walletAddress && (
                        <p style={{ margin: 0, fontSize: 12, color: '#555' }}>Wallet: {p.walletAddress}</p>
                      )}
                    </div>
                  )
                })()
              : (
                <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 6, padding: 12 }}>
                  <p style={{ margin: 0, color: '#991b1b' }}>✗ No matching post found for this hash.</p>
                </div>
              )
          )}
        </div>
      )}

      {/* ── Feed ── */}
      {tab === 'feed' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Feed</h2>
            <button onClick={() => feedQuery.refetch()} disabled={feedQuery.isFetching}>
              {feedQuery.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {feedQuery.isLoading && <p>Loading posts…</p>}
          {feedQuery.isError && <p style={{ color: 'red' }}>Error loading feed.</p>}

          {feedQuery.data && (
            feedQuery.data.posts.length === 0
              ? <p style={{ color: '#555' }}>No posts yet. Publish something first!</p>
              : feedQuery.data.posts.map((post, i) => (
                <div
                  key={i}
                  style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 16, paddingBottom: 16 }}
                >
                  <h3 style={{ margin: '0 0 4px' }}>{post.title}</h3>
                  <p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: 13 }}>
                    by {post.author} · {new Date(post.date).toLocaleString()}
                  </p>
                  <p style={{ margin: '0 0 6px' }}>{post.body}</p>
                  <p
                    style={{ margin: 0, fontSize: 11, color: '#9ca3af', wordBreak: 'break-all', fontFamily: 'monospace' }}
                    title="SHA-256 hash"
                  >
                    {post.hash}
                  </p>
                  {post.walletAddress && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                      Wallet: {post.walletAddress}
                    </p>
                  )}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  )
}
