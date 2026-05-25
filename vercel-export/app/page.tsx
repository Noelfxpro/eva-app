'use client'

import { useState, useEffect, useCallback } from 'react'

// ── Petra Wallet types ────────────────────────────────────────────────────────
declare global {
  interface Window {
    aptos?: {
      connect: () => Promise<{ address: string }>
      account: () => Promise<{ address: string; publicKey: string | string[] }>
      signMessage: (payload: { message: string; nonce: string }) => Promise<{
        fullMessage: string; message: string; nonce: string
        prefix: string; signature: string | string[]; address?: string
      }>
      signAndSubmitTransaction: (txn: {
        type: string
        code?: { bytecode: string }
        arguments?: unknown[]
        type_arguments?: string[]
      }) => Promise<{ hash: string }>
    }
  }
}

// ── Compiled Move script bytecode (no external deps — works on any Aptos network)
// Script: script { fun main(_account: &signer, _hash: vector<u8>) {} }
// The hash arg is permanently stored in the transaction payload on-chain.
const ANCHOR_SCRIPT_BYTECODE =
  '0xa11ceb0b0900000a0405000607060e08142010341f02060c0a0200083c53454c463e5f30046d61696e' +
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff14636f6d70696c6174' +
  '696f6e5f6d65746164617461090003322e3003322e3300000101030b000102'

const APTOS_NETWORKS = ['devnet', 'testnet', 'mainnet'] as const
type AptosNetwork = typeof APTOS_NETWORKS[number]

// ── Types ─────────────────────────────────────────────────────────────────────
interface Post {
  author: string; title: string; body: string; hash: string
  signature: string | null; publicKey: string | null; signedMessage: string | null
  walletAddress: string | null; aptosHash: string | null; aptosNetwork: string | null
  date: string
}

// ── Crypto helpers (browser SubtleCrypto — zero packages) ─────────────────────
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return new Uint8Array(Array.from({ length: clean.length / 2 }, (_, i) =>
    parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  ))
}

async function verifyEd25519(sig: string, msg: string, pk: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(pk), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, hexToBytes(sig), new TextEncoder().encode(msg))
  } catch { return false }
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
  const [aptosNetwork, setAptosNetwork] = useState<AptosNetwork>('testnet')
  const [signature, setSignature] = useState<string | null>(null)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [signedMessage, setSignedMessage] = useState<string | null>(null)
  const [aptosHash, setAptosHash] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [anchoring, setAnchoring] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishStatus, setPublishStatus] = useState<string | null>(null)

  // Verify
  const [verifyHash, setVerifyHash] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    found: boolean; post: Post | null; sigValid?: boolean; onChain: boolean | null
  } | null>(null)

  // Feed
  const [posts, setPosts] = useState<Post[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [feedError, setFeedError] = useState<string | null>(null)

  const loadFeed = useCallback(async () => {
    setFeedLoading(true); setFeedError(null)
    try {
      const res = await fetch('/api/feed')
      const data = await res.json()
      setPosts(data.posts ?? [])
    } catch { setFeedError('Failed to load feed.') }
    finally { setFeedLoading(false) }
  }, [])

  useEffect(() => { if (tab === 'feed') loadFeed() }, [tab, loadFeed])

  // Reset crypto state when hash changes
  useEffect(() => {
    setSignature(null); setPublicKey(null); setSignedMessage(null); setAptosHash(null)
  }, [hash])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const generateHash = async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(author + title + body))
    setHash('sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
  }

  const connectWallet = async () => {
    if (!window.aptos) { alert('Petra Wallet not detected. Install from https://petra.app'); return }
    try { const r = await window.aptos.connect(); setWallet(r.address) }
    catch { alert('Wallet connection cancelled.') }
  }

  const signWithPetra = async () => {
    if (!window.aptos || !hash) return
    setSigning(true)
    try {
      const account = await window.aptos.account()
      const pk = Array.isArray(account.publicKey) ? account.publicKey[0] : account.publicKey
      const result = await window.aptos.signMessage({ message: hash, nonce: 'eva-authorship' })
      const sig = Array.isArray(result.signature) ? result.signature[0] : result.signature
      setPublicKey(pk); setSignature(sig); setSignedMessage(result.fullMessage)
    } catch (err) { alert('Signing failed: ' + (err instanceof Error ? err.message : String(err))) }
    finally { setSigning(false) }
  }

  const anchorOnAptos = async () => {
    if (!window.aptos) { alert('Petra Wallet not detected.'); return }
    if (!hash) { alert('Generate a SHA-256 hash first.'); return }
    setAnchoring(true)
    try {
      const hashHex = '0x' + Array.from(new TextEncoder().encode(hash))
        .map(b => b.toString(16).padStart(2, '0')).join('')

      const result = await window.aptos.signAndSubmitTransaction({
        type: 'script_payload',
        code: { bytecode: ANCHOR_SCRIPT_BYTECODE },
        type_arguments: [],
        arguments: [hashHex],
      })
      setAptosHash(result.hash)
    } catch (err) { alert('Anchoring failed: ' + (err instanceof Error ? err.message : String(err))) }
    finally { setAnchoring(false) }
  }

  const handlePublish = async () => {
    if (!author || !title || !body || !hash) { alert('Fill in all fields and generate a hash first.'); return }
    setPublishing(true); setPublishStatus(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author, title, body, hash, signature, publicKey, signedMessage, walletAddress: wallet,
          aptosHash, aptosNetwork: aptosHash ? aptosNetwork : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      setPublishStatus('Published successfully!')
      setAuthor(''); setTitle(''); setBody(''); setHash('')
      setSignature(null); setPublicKey(null); setSignedMessage(null); setAptosHash(null)
    } catch (err) { setPublishStatus('Error: ' + (err instanceof Error ? err.message : 'Unknown')) }
    finally { setPublishing(false) }
  }

  const handleVerify = async () => {
    if (!verifyHash.trim()) return
    setVerifying(true); setVerifyResult(null)
    try {
      const res = await fetch('/api/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: verifyHash.trim() }),
      })
      const data = await res.json()
      const post: Post | null = data.post ?? null
      let sigValid: boolean | undefined
      if (post?.signature && post.publicKey && post.signedMessage) {
        sigValid = await verifyEd25519(post.signature, post.signedMessage, post.publicKey)
      }
      setVerifyResult({ found: data.found, post, sigValid, onChain: data.onChain ?? null })
    } catch { setVerifyResult({ found: false, post: null, onChain: null }) }
    finally { setVerifying(false) }
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const mono: React.CSSProperties = { fontFamily: 'monospace', wordBreak: 'break-all' }
  const inp: React.CSSProperties = { padding: 8, fontSize: 14, width: '100%', boxSizing: 'border-box' }
  const badge = (color: 'green' | 'red' | 'gray' | 'blue'): React.CSSProperties => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 4, marginRight: 6,
    fontSize: 12, fontWeight: 'bold',
    background: color === 'green' ? '#dcfce7' : color === 'red' ? '#fee2e2' : color === 'blue' ? '#dbeafe' : '#f3f4f6',
    color: color === 'green' ? '#166534' : color === 'red' ? '#991b1b' : color === 'blue' ? '#1e40af' : '#374151',
  })

  return (
    <div style={{ padding: 30, fontFamily: 'Arial', maxWidth: 640 }}>
      <h1 style={{ margin: '0 0 4px' }}>EVA 🚀</h1>
      <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 13 }}>Verified Authorship on Shelby + Aptos</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {(['publish', 'verify', 'feed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ fontWeight: tab === t ? 'bold' : undefined, textDecoration: tab === t ? 'underline' : undefined }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Publish ── */}
      {tab === 'publish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Publish</h2>

          {/* Wallet + Network row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={connectWallet} style={{ flex: 1 }}>
              {wallet ? `✓ ${wallet.slice(0, 8)}…${wallet.slice(-6)}` : 'Connect Petra Wallet'}
            </button>
            <select value={aptosNetwork} onChange={e => setAptosNetwork(e.target.value as AptosNetwork)}
              style={{ padding: '4px 8px', fontSize: 13 }}>
              {APTOS_NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <input placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)} style={inp} />
          <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} style={inp} />
          <textarea placeholder="Content" value={body} onChange={e => setBody(e.target.value)}
            rows={5} style={{ ...inp, resize: 'vertical' }} />

          {/* Step 1 */}
          <button onClick={generateHash} disabled={!author || !title || !body}>
            1. Generate SHA-256 Hash
          </button>
          {hash && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>SHA-256 HASH</div>
              <div style={{ ...mono, fontSize: 12 }}>{hash}</div>
            </div>
          )}

          {/* Step 2 — Sign */}
          {hash && (
            <>
              <button onClick={signWithPetra} disabled={signing || !wallet}
                title={!wallet ? 'Connect Petra Wallet first' : ''}>
                {signing ? 'Waiting for Petra…' : signature ? '✓ Signed with Petra' : '2. Sign with Petra Wallet'}
              </button>
              {!wallet && (
                <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>
                  ⚠ Connect wallet to enable signing and on-chain anchoring.
                </p>
              )}
              {signature && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, padding: 8 }}>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 'bold', marginBottom: 4 }}>✓ SIGNED — Ed25519</div>
                  <div style={{ ...mono, fontSize: 11, color: '#166534' }}>{signature.slice(0, 32)}…</div>
                </div>
              )}
            </>
          )}

          {/* Step 3 — Anchor on Aptos */}
          {hash && (
            <>
              <button onClick={anchorOnAptos} disabled={anchoring || !wallet}
                title={!wallet ? 'Connect Petra Wallet first' : ''}>
                {anchoring
                  ? 'Submitting to Aptos…'
                  : aptosHash
                    ? `✓ Anchored on ${aptosNetwork}`
                    : `3. Anchor on Aptos (${aptosNetwork})`}
              </button>
              {aptosHash && (
                <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 4, padding: 8 }}>
                  <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 'bold', marginBottom: 4 }}>
                    ✓ ON-CHAIN — Aptos {aptosNetwork}
                  </div>
                  <div style={{ ...mono, fontSize: 11, color: '#1e40af', marginBottom: 6 }}>
                    {aptosHash.slice(0, 32)}…{aptosHash.slice(-12)}
                  </div>
                  <a
                    href={`https://explorer.aptoslabs.com/txn/${aptosHash}?network=${aptosNetwork}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'underline' }}>
                    View on Aptos Explorer ↗
                  </a>
                </div>
              )}
            </>
          )}

          {/* Step 4 — Publish */}
          <button onClick={handlePublish} disabled={publishing || !hash}
            style={{ padding: '10px 20px', fontWeight: 'bold' }}>
            {publishing ? 'Publishing…' : '4. Publish to Shelby'}
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
            Paste a SHA-256 hash to verify the Shelby record, Ed25519 signature, and Aptos on-chain anchor.
          </p>

          <textarea placeholder="sha256:abc123…" value={verifyHash}
            onChange={e => setVerifyHash(e.target.value)} rows={2}
            style={{ ...inp, ...mono, fontSize: 13 }} />

          <button onClick={handleVerify} disabled={verifying || !verifyHash.trim()}>
            {verifying ? 'Verifying…' : 'Verify'}
          </button>

          {verifyResult !== null && (() => {
            const { found, post, sigValid, onChain } = verifyResult
            if (!found || !post) {
              return (
                <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 6, padding: 12 }}>
                  <p style={{ margin: 0, color: '#991b1b', fontWeight: 'bold' }}>✗ No post found for this hash.</p>
                </div>
              )
            }
            return (
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: 14 }}>
                <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <span style={badge('green')}>✓ Hash Matched</span>
                  {post.signature && post.publicKey && post.signedMessage
                    ? <span style={badge(sigValid ? 'green' : 'red')}>{sigValid ? '✓ Signature Valid' : '✗ Signature Invalid'}</span>
                    : <span style={badge('gray')}>⚠ No Signature</span>}
                  {onChain === true
                    ? <span style={badge('blue')}>✓ On-Chain Verified</span>
                    : onChain === false
                      ? <span style={badge('red')}>✗ Not On-Chain</span>
                      : post.aptosHash
                        ? <span style={badge('gray')}>⏳ Checking chain…</span>
                        : <span style={badge('gray')}>⚠ Not Anchored</span>}
                </div>

                <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{post.title}</h3>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6b7280' }}>
                  by <strong>{post.author}</strong> · {new Date(post.date).toLocaleString()}
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 14 }}>{post.body}</p>
                <div style={{ ...mono, fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{post.hash}</div>

                {post.walletAddress && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    <strong>Wallet:</strong> <span style={mono}>{post.walletAddress}</span>
                  </div>
                )}
                {post.publicKey && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    <strong>Public Key:</strong> <span style={mono}>{post.publicKey.slice(0, 18)}…{post.publicKey.slice(-10)}</span>
                  </div>
                )}
                {post.signature && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    <strong>Signature:</strong> <span style={mono}>{post.signature.slice(0, 18)}…{post.signature.slice(-10)}</span>
                  </div>
                )}
                {post.aptosHash && (
                  <div style={{ fontSize: 12, color: '#1e40af', marginTop: 4 }}>
                    <strong>Aptos Txn ({post.aptosNetwork}):</strong>{' '}
                    <span style={mono}>{post.aptosHash.slice(0, 20)}…{post.aptosHash.slice(-10)}</span>{' '}
                    <a
                      href={`https://explorer.aptoslabs.com/txn/${post.aptosHash}?network=${post.aptosNetwork}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: '#1d4ed8', textDecoration: 'underline', fontSize: 11 }}>
                      View ↗
                    </a>
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
            <button onClick={loadFeed} disabled={feedLoading}>{feedLoading ? 'Refreshing…' : 'Refresh'}</button>
          </div>
          {feedLoading && <p style={{ color: '#6b7280' }}>Loading…</p>}
          {feedError && <p style={{ color: 'red' }}>{feedError}</p>}
          {!feedLoading && !feedError && posts.length === 0 && <p style={{ color: '#6b7280' }}>No posts yet.</p>}
          {posts.map((post, i) => (
            <div key={i} style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 16, paddingBottom: 16 }}>
              <h3 style={{ margin: '0 0 4px' }}>{post.title}</h3>
              <p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: 13 }}>
                by <strong>{post.author}</strong> · {new Date(post.date).toLocaleString()}
                {post.signature && (
                  <span style={{ marginLeft: 6, fontSize: 11, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 10, fontWeight: 'bold' }}>
                    ✓ Signed
                  </span>
                )}
                {post.aptosHash && (
                  <a
                    href={`https://explorer.aptoslabs.com/txn/${post.aptosHash}?network=${post.aptosNetwork}`}
                    target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', marginLeft: 6 }}>
                    <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 10, fontWeight: 'bold' }}>
                      ⛓ On-Chain ↗
                    </span>
                  </a>
                )}
              </p>
              <p style={{ margin: '0 0 6px', fontSize: 14 }}>{post.body}</p>
              <p style={{ margin: 0, ...mono, fontSize: 11, color: '#9ca3af' }}>{post.hash}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
