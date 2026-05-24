'use client'

import { useState, useEffect, useCallback } from 'react'

declare global {
  interface Window {
    aptos?: {
      connect: () => Promise<{ address: string }>
    }
  }
}

interface Post {
  author: string
  title: string
  body: string
  hash: string
  signature: string | null
  walletAddress: string | null
  date: string
}

export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')

  // ── Publish state ──────────────────────────────────────────────────────────
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [hash, setHash] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)
  const [publishStatus, setPublishStatus] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  // ── Verify state ───────────────────────────────────────────────────────────
  const [verifyHash, setVerifyHash] = useState('')
  const [verifyResult, setVerifyResult] = useState<{ found: boolean; post: Post | null } | null>(null)
  const [verifying, setVerifying] = useState(false)

  // ── Feed state ─────────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)

  const loadFeed = useCallback(async () => {
    setFeedLoading(true)
    setFeedError(null)
    try {
      const res = await fetch('/api/feed')
      const data = await res.json()
      setPosts(data.posts ?? [])
    } catch {
      setFeedError('Failed to load feed.')
    } finally {
      setFeedLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'feed') loadFeed()
  }, [tab, loadFeed])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const generateHash = async () => {
    const msg = author + title + body
    const enc = new TextEncoder().encode(msg)
    const buf = await crypto.subtle.digest('SHA-256', enc)
    const arr = Array.from(new Uint8Array(buf))
    setHash('sha256:' + arr.map(b => b.toString(16).padStart(2, '0')).join(''))
  }

  const connectWallet = async () => {
    if (!window.aptos) {
      alert('Petra Wallet not detected. Install it from https://petra.app')
      return
    }
    try {
      const res = await window.aptos.connect()
      setWallet(res.address)
    } catch {
      alert('Wallet connection cancelled.')
    }
  }

  const handlePublish = async () => {
    if (!author || !title || !body || !hash) {
      alert('Please fill in all fields and generate a hash first.')
      return
    }
    setPublishing(true)
    setPublishStatus(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, title, body, hash, walletAddress: wallet, signature: null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      setPublishStatus('Published successfully!')
      setAuthor('')
      setTitle('')
      setBody('')
      setHash('')
    } catch (err: unknown) {
      setPublishStatus('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setPublishing(false)
    }
  }

  const handleVerify = async () => {
    if (!verifyHash.trim()) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: verifyHash.trim() }),
      })
      const data = await res.json()
      setVerifyResult({ found: data.found, post: data.post ?? null })
    } catch {
      setVerifyResult({ found: false, post: null })
    } finally {
      setVerifying(false)
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const activeTab: React.CSSProperties = { fontWeight: 'bold', textDecoration: 'underline' }

  return (
    <div style={{ padding: 30, fontFamily: 'Arial', maxWidth: 640 }}>
      <h1>EVA 🚀</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {(['publish', 'verify', 'feed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tab === t ? activeTab : {}}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Publish ── */}
      {tab === 'publish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Publish</h2>

          <button onClick={connectWallet}>
            {wallet
              ? `✓ Connected: ${wallet.slice(0, 8)}…${wallet.slice(-6)}`
              : 'Connect Petra Wallet'}
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
            <p style={{
              wordBreak: 'break-all', fontSize: 13, background: '#f5f5f5',
              padding: 8, borderRadius: 4, margin: 0, fontFamily: 'monospace',
            }}>
              {hash}
            </p>
          )}

          <button
            onClick={handlePublish}
            disabled={publishing || !hash}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            {publishing ? 'Publishing…' : 'Publish to Shelby'}
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
            Paste a SHA-256 hash to check whether a matching published post exists in Shelby storage.
          </p>

          <textarea
            placeholder="sha256:abc123…"
            value={verifyHash}
            onChange={e => setVerifyHash(e.target.value)}
            rows={3}
            style={{ padding: 8, fontSize: 13, fontFamily: 'monospace' }}
          />

          <button onClick={handleVerify} disabled={verifying || !verifyHash.trim()}>
            {verifying ? 'Checking…' : 'Verify Hash'}
          </button>

          {verifyResult !== null && (
            verifyResult.found && verifyResult.post
              ? (
                <div style={{
                  background: '#f0fff4', border: '1px solid #86efac',
                  borderRadius: 6, padding: 12,
                }}>
                  <p style={{ margin: '0 0 8px', color: '#166534', fontWeight: 'bold' }}>
                    ✓ Verified — authorship confirmed
                  </p>
                  <p style={{ margin: '0 0 4px', fontSize: 15 }}>
                    <strong>{verifyResult.post.title}</strong>
                  </p>
                  <p style={{ margin: '0 0 4px', fontSize: 13, color: '#374151' }}>
                    by <strong>{verifyResult.post.author}</strong>
                    {' · '}
                    {new Date(verifyResult.post.date).toLocaleString()}
                  </p>
                  <p style={{ margin: '0 0 6px', fontSize: 14 }}>{verifyResult.post.body}</p>
                  <p style={{
                    margin: '0 0 4px', fontSize: 11, color: '#6b7280',
                    wordBreak: 'break-all', fontFamily: 'monospace',
                  }}>
                    {verifyResult.post.hash}
                  </p>
                  {verifyResult.post.walletAddress && (
                    <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
                      Wallet: {verifyResult.post.walletAddress}
                    </p>
                  )}
                </div>
              )
              : (
                <div style={{
                  background: '#fff1f2', border: '1px solid #fca5a5',
                  borderRadius: 6, padding: 12,
                }}>
                  <p style={{ margin: 0, color: '#991b1b' }}>
                    ✗ No matching post found for this hash.
                  </p>
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
            <button onClick={loadFeed} disabled={feedLoading}>
              {feedLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {feedLoading && <p style={{ color: '#6b7280' }}>Loading posts…</p>}
          {feedError && <p style={{ color: 'red' }}>{feedError}</p>}

          {!feedLoading && !feedError && posts.length === 0 && (
            <p style={{ color: '#6b7280' }}>No posts yet. Publish something first!</p>
          )}

          {posts.map((post, i) => (
            <div
              key={i}
              style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 16, paddingBottom: 16 }}
            >
              <h3 style={{ margin: '0 0 4px' }}>{post.title}</h3>
              <p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: 13 }}>
                by <strong>{post.author}</strong>
                {' · '}
                {new Date(post.date).toLocaleString()}
              </p>
              <p style={{ margin: '0 0 6px', fontSize: 14 }}>{post.body}</p>
              <p
                style={{
                  margin: 0, fontSize: 11, color: '#9ca3af',
                  wordBreak: 'break-all', fontFamily: 'monospace',
                }}
                title="SHA-256 authorship hash"
              >
                {post.hash}
              </p>
              {post.walletAddress && (
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#9ca3af' }}>
                  Wallet: {post.walletAddress}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
