'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Petra Wallet types ────────────────────────────────────────────────────────
declare global {
  interface Window {
    aptos?: {
      connect: () => Promise<{ address: string }>
      account: () => Promise<{ address: string; publicKey: string | string[] }>
      signMessage: (payload: { message: string; nonce: string }) => Promise<{
        fullMessage: string
        message: string
        nonce: string
        prefix: string
        signature: string | string[]
        address?: string
      }>
    }
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Post {
  author: string
  title: string
  body: string
  hash: string
  signature: string | null
  publicKey: string | null
  signedMessage: string | null
  walletAddress: string | null
  date: string
}

// ── Crypto helpers (browser SubtleCrypto — no external package) ───────────────
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) throw new Error('Invalid hex')
  return new Uint8Array(Array.from({ length: clean.length / 2 }, (_, i) =>
    parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  ))
}

async function verifyEd25519(signature: string, message: string, publicKey: string): Promise<boolean> {
  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      hexToBytes(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    return await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      hexToBytes(signature),
      new TextEncoder().encode(message)
    )
  } catch {
    return false
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')

  // Publish
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [hash, setHash] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [signedMessage, setSignedMessage] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishStatus, setPublishStatus] = useState<string | null>(null)

  // Verify
  const [verifyHash, setVerifyHash] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    found: boolean
    post: Post | null
    sigValid?: boolean
  } | null>(null)

  // Feed
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

  useEffect(() => { if (tab === 'feed') loadFeed() }, [tab, loadFeed])

  // Reset signature whenever the hash changes (content was modified after signing)
  useEffect(() => {
    setSignature(null)
    setPublicKey(null)
    setSignedMessage(null)
  }, [hash])

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

  const signWithPetra = async () => {
    if (!window.aptos) { alert('Petra Wallet not detected.'); return }
    if (!hash) { alert('Generate a SHA-256 hash first.'); return }
    setSigning(true)
    try {
      const account = await window.aptos.account()
      const pk = Array.isArray(account.publicKey) ? account.publicKey[0] : account.publicKey
      // Petra prepends "APTOS\nmessage: …\nnonce: …" — fullMessage is the exact bytes signed
      const result = await window.aptos.signMessage({ message: hash, nonce: 'eva-authorship' })
      const sig = Array.isArray(result.signature) ? result.signature[0] : result.signature
      setPublicKey(pk)
      setSignature(sig)
      setSignedMessage(result.fullMessage)
    } catch (err) {
      alert('Signing failed: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSigning(false)
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
        body: JSON.stringify({ author, title, body, hash, signature, publicKey, signedMessage, walletAddress: wallet }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      setPublishStatus('Published successfully!')
      setAuthor(''); setTitle(''); setBody(''); setHash('')
      setSignature(null); setPublicKey(null); setSignedMessage(null)
    } catch (err) {
      setPublishStatus('Error: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setPublishing(false)
    }
  }

  // async so we can await Ed25519 verification after fetching the post
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
      const post: Post | null = data.post ?? null
      let sigValid: boolean | undefined
      if (post?.signature && post.publicKey && post.signedMessage) {
        sigValid = await verifyEd25519(post.signature, post.signedMessage, post.publicKey)
      }
      setVerifyResult({ found: data.found, post, sigValid })
    } catch {
      setVerifyResult({ found: false, post: null })
    } finally {
      setVerifying(false)
    }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const s = {
    input: { padding: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
    mono: { fontFamily: 'monospace', wordBreak: 'break-all' } as React.CSSProperties,
    badge: (color: 'green' | 'red' | 'gray'): React.CSSProperties => ({
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 12, fontWeight: 'bold', marginRight: 6,
      background: color === 'green' ? '#dcfce7' : color === 'red' ? '#fee2e2' : '#f3f4f6',
      color: color === 'green' ? '#166534' : color === 'red' ? '#991b1b' : '#374151',
    }),
  }

  return (
    <div style={{ padding: 30, fontFamily: 'Arial', maxWidth: 640 }}>
      <h1 style={{ margin: '0 0 4px' }}>EVA 🚀</h1>
      <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13 }}>
        Verified Authorship on Shelby
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {(['publish', 'verify', 'feed'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontWeight: tab === t ? 'bold' : undefined,
              textDecoration: tab === t ? 'underline' : undefined,
            }}
          >
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
              ? `✓ ${wallet.slice(0, 8)}…${wallet.slice(-6)}`
              : 'Connect Petra Wallet'}
          </button>

          <input placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)} style={s.input} />
          <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} style={s.input} />
          <textarea
            placeholder="Content"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={6}
            style={{ ...s.input, resize: 'vertical' }}
          />

          <button onClick={generateHash} disabled={!author || !title || !body}>
            1. Generate SHA-256 Hash
          </button>

          {hash && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>SHA-256 HASH</div>
              <div style={{ ...s.mono, fontSize: 12, color: '#1e293b' }}>{hash}</div>
            </div>
          )}

          {hash && (
            <>
              <button
                onClick={signWithPetra}
                disabled={signing || !wallet}
                title={!wallet ? 'Connect Petra Wallet first' : ''}
              >
                {signing ? 'Waiting for Petra…' : signature ? '✓ Signed with Petra' : '2. Sign with Petra Wallet'}
              </button>
              {!wallet && (
                <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>
                  ⚠ Connect Petra Wallet above to sign (optional but recommended).
                </p>
              )}
            </>
          )}

          {signature && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 11, color: '#166534', marginBottom: 4, fontWeight: 'bold' }}>
                ✓ SIGNED — Ed25519 Signature
              </div>
              <div style={{ ...s.mono, fontSize: 11, color: '#166534' }}>
                {signature.slice(0, 32)}…{signature.slice(-16)}
              </div>
            </div>
          )}

          <button
            onClick={handlePublish}
            disabled={publishing || !hash}
            style={{ padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            {publishing ? 'Publishing…' : '3. Publish to Shelby'}
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
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Paste a SHA-256 hash to look up the matching post and verify its Ed25519 signature.
          </p>

          <textarea
            placeholder="sha256:abc123…"
            value={verifyHash}
            onChange={e => setVerifyHash(e.target.value)}
            rows={2}
            style={{ ...s.input, ...s.mono, fontSize: 13 }}
          />

          <button onClick={handleVerify} disabled={verifying || !verifyHash.trim()}>
            {verifying ? 'Checking…' : 'Verify'}
          </button>

          {verifyResult !== null && (() => {
            const { found, post, sigValid } = verifyResult
            if (!found || !post) {
              return (
                <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 6, padding: 12 }}>
                  <p style={{ margin: 0, color: '#991b1b', fontWeight: 'bold' }}>
                    ✗ No post found for this hash.
                  </p>
                </div>
              )
            }
            return (
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: 14 }}>
                <div style={{ marginBottom: 10 }}>
                  <span style={s.badge('green')}>✓ Hash Matched</span>
                  {post.signature && post.publicKey && post.signedMessage
                    ? <span style={s.badge(sigValid ? 'green' : 'red')}>
                        {sigValid ? '✓ Signature Valid' : '✗ Signature Invalid'}
                      </span>
                    : <span style={s.badge('gray')}>⚠ No Signature</span>
                  }
                </div>

                <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{post.title}</h3>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6b7280' }}>
                  by <strong>{post.author}</strong>
                  {' · '}
                  {new Date(post.date).toLocaleString()}
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 14 }}>{post.body}</p>
                <div style={{ ...s.mono, fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{post.hash}</div>

                {post.walletAddress && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    <strong>Wallet:</strong> <span style={s.mono}>{post.walletAddress}</span>
                  </div>
                )}
                {post.publicKey && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    <strong>Public Key:</strong>{' '}
                    <span style={s.mono}>{post.publicKey.slice(0, 18)}…{post.publicKey.slice(-10)}</span>
                  </div>
                )}
                {post.signature && (
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    <strong>Signature:</strong>{' '}
                    <span style={s.mono}>{post.signature.slice(0, 18)}…{post.signature.slice(-10)}</span>
                  </div>
                )}
              </div>
            )
          })()}
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
            <div key={i} style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 16, paddingBottom: 16 }}>
              <h3 style={{ margin: '0 0 4px' }}>{post.title}</h3>
              <p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: 13 }}>
                by <strong>{post.author}</strong>
                {' · '}
                {new Date(post.date).toLocaleString()}
                {post.signature && (
                  <span style={{
                    marginLeft: 8, fontSize: 11, background: '#dcfce7',
                    color: '#166534', padding: '1px 6px', borderRadius: 10, fontWeight: 'bold',
                  }}>
                    ✓ Signed
                  </span>
                )}
              </p>
              <p style={{ margin: '0 0 6px', fontSize: 14 }}>{post.body}</p>
              <p style={{ margin: 0, ...s.mono, fontSize: 11, color: '#9ca3af' }}>{post.hash}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
