'use client'

import { useState, useEffect, useCallback } from 'react'

// â”€â”€ Petra Wallet types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

const ANCHOR_SCRIPT_BYTECODE =
  '0xa11ceb0b0900000a0405000607060e08142010341f02060c0a0200083c53454c463e5f30046d61696e' +
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff14636f6d70696c6174' +
  '696f6e5f6d65746164617461090003322e3003322e3300000101030b000102'

const APTOS_NETWORKS = ['devnet', 'testnet', 'mainnet'] as const
type AptosNetwork = typeof APTOS_NETWORKS[number]

interface Post {
  author: string; title: string; body: string; hash: string
  signature: string | null; publicKey: string | null; signedMessage: string | null
  walletAddress: string | null; aptosHash: string | null; aptosNetwork: string | null
  date: string
}

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

export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')
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
  const [verifyHash, setVerifyHash] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    found: boolean; post: Post | null; sigValid?: boolean; onChain: boolean | null
  } | null>(null)
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

  useEffect(() => {
    setSignature(null); setPublicKey(null); setSignedMessage(null); setAptosHash(null)
  }, [hash])

  const generateHash = async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(author + title + body))
    setHash('sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
  }

  // â”€â”€ FIXED: Mobile Petra wallet connection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const connectWallet = async () => {
    if (!window.aptos) {
      alert('Petra Wallet not detected. Install from https://petra.app')
      return
    }
    try {
      const r = await window.aptos.connect()
      let addr = r?.address
      if (!addr) {
        const account = await window.aptos.account()
        addr = account?.address
      }
      if (addr) {
        setWallet(addr)
      } else {
        alert('Could not get wallet address. Please try again.')
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('cancel') || msg.includes('reject') || msg.includes('denied')) {
        alert('Connection cancelled. Please approve the connection in Petra.')
      } else {
        alert('Connection error: ' + msg)
      }
    }
  }

  const signWithPetra = async () => {
    if (!window.aptos || !hash) return
    setSigning(true)
    try {
      const account = await window.aptos.account()
      const pk = Array.isArray(account.publicKey) ? account.publicKey[0] : account.publicKey
      const result = await window.aptos.signMessage({ message: hash, nonce: 'eva-authorship' })
      const sig = Array.isArray(result.signature) ? result.signature[0] : result.signature
      setSignature(sig)
      setPublicKey(pk)
      setSignedMessage(result.fullMessage ?? hash)
    } catch (e: unknown) {
      alert('Signing failed: ' + (e instanceof Error ? e.message : String(e)))
    }
    setSigning(false)
  }

  const anchorOnAptos = async () => {
    if (!window.aptos || !hash) return
    setAnchoring(true)
    try {
      const hashBytes = Array.from(new TextEncoder().encode(hash))
      const result = await window.aptos.signAndSubmitTransaction({
        type: 'script_payload',
        code: { bytecode: ANCHOR_SCRIPT_BYTECODE },
        arguments: [hashBytes],
        type_arguments: [],
      })
      setAptosHash(result.hash)
    } catch (e: unknown) {
      alert('Anchoring failed: ' + (e instanceof Error ? e.message : String(e)))
    }
    setAnchoring(false)
  }

  const handlePublish = async () => {
    if (!hash) return
    setPublishing(true)
    setPublishStatus(null)
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author, title, body, hash,
          signature, publicKey, signedMessage,
          walletAddress: wallet,
          aptosHash, aptosNetwork,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Publish failed')
      setPublishStatus('Published successfully!')
      setAuthor(''); setTitle(''); setBody(''); setHash('')
      setTab('feed')
    } catch (e: unknown) {
      setPublishStatus('Error: ' + (e instanceof Error ? e.message : String(e)))
    }
    setPublishing(false)
  }

  const handleVerify = async () => {
    if (!verifyHash.trim()) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await fetch(`/api/verify?hash=${encodeURIComponent(verifyHash.trim())}`)
      const data = await res.json()
      if (!data.found || !data.post) {
        setVerifyResult({ found: false, post: null, onChain: null })
      } else {
        const post: Post = data.post
        let sigValid: boolean | undefined
        if (post.signature && post.publicKey && post.signedMessage) {
          sigValid = await verifyEd25519(post.signature, post.signedMessage, post.publicKey)
        }
        let onChain: boolean | null = null
        if (post.aptosHash && post.aptosNetwork) {
          try {
            const r = await fetch(
              `https://fullnode.${post.aptosNetwork}.aptoslabs.com/v1/transactions/by_hash/${post.aptosHash}`
            )
            onChain = r.ok
          } catch { onChain = null }
        }
        setVerifyResult({ found: true, post, sigValid, onChain })
      }
    } catch {
      setVerifyResult({ found: false, post: null, onChain: null })
    }
    setVerifying(false)
  }

  const mono: React.CSSProperties = { fontFamily: 'monospace', wordBreak: 'break-all' }
  const inp: React.CSSProperties = {
    padding: '8px 10px', fontSize: 14, border: '1px solid #d1d5db',
    borderRadius: 4, width: '100%', boxSizing: 'border-box',
  }

  const badge = (color: 'green' | 'red' | 'gray' | 'blue'): React.CSSProperties => ({
    display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 'bold',
    background: color === 'green' ? '#dcfce7' : color === 'red' ? '#fee2e2' : color === 'blue' ? '#dbeafe' : '#f3f4f6',
    color: color === 'green' ? '#166534' : color === 'red' ? '#991b1b' : color === 'blue' ? '#1e40af' : '#6b7280',
  })

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24 }}>EVA ðŸš€</h1>
      <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: 14 }}>Verified Authorship on Shelby + Aptos</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['publish', 'verify', 'feed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '6px 16px', borderRadius: 4, border: '1px solid #d1d5db', cursor: 'pointer',
              background: tab === t ? '#1e40af' : '#fff', color: tab === t ? '#fff' : '#374151',
              fontWeight: tab === t ? 'bold' : 'normal', textTransform: 'capitalize',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* â”€â”€ Publish â”€â”€ */}
      {tab === 'publish' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Publish</h2>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={connectWallet} style={{ flex: 1, padding: '8px 12px', cursor: 'pointer', borderRadius: 4, border: '1px solid #d1d5db' }}>
              {wallet ? `âœ“ ${wallet.slice(0, 8)}â€¦${wallet.slice(-6)}` : 'Connect Petra Wallet'}
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

          <button onClick={generateHash} disabled={!author || !title || !body}
            style={{ padding: '8px', cursor: 'pointer', borderRadius: 4, border: '1px solid #d1d5db' }}>
            1. Generate SHA-256 Hash
          </button>

          {hash && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: 8 }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>SHA-256 HASH</div>
              <div style={{ ...mono, fontSize: 12 }}>{hash}</div>
            </div>
          )}

          {hash && (
            <>
              <button onClick={signWithPetra} disabled={signing || !wallet}
                style={{ padding: '8px', cursor: 'pointer', borderRadius: 4, border: '1px solid #d1d5db' }}>
                {signing ? 'Waiting for Petraâ€¦' : signature ? 'âœ“ Signed with Petra' : '2. Sign with Petra Wallet'}
              </button>
              {!wallet && (
                <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>
                  âš  Connect wallet to enable signing and on-chain anchoring.
                </p>
              )}
              {signature && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, padding: 8 }}>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 'bold', marginBottom: 4 }}>âœ“ SIGNED â€” Ed25519</div>
                  <div style={{ ...mono, fontSize: 11, color: '#166534' }}>{signature.slice(0, 32)}â€¦</div>
                </div>
              )}
            </>
          )}

          {hash && (
            <>
              <button onClick={anchorOnAptos} disabled={anchoring || !wallet}
                style={{ padding: '8px', cursor: 'pointer', borderRadius: 4, border: '1px solid #d1d5db' }}>
                {anchoring ? 'Submitting to Aptosâ€¦' : aptosHash ? `âœ“ Anchored on ${aptosNetwork}` : `3. Anchor on Aptos (${aptosNetwork})`}
              </button>
              {aptosHash && (
                <div style={{ background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 4, padding: 8 }}>
                  <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 'bold', marginBottom: 4 }}>âœ“ ON-CHAIN â€” Aptos {aptosNetwork}</div>
                  <div style={{ ...mono, fontSize: 11, color: '#1e40af', marginBottom: 6 }}>{aptosHash.slice(0, 32)}â€¦{aptosHash.slice(-12)}</div>
                  <a href={`https://explorer.aptoslabs.com/txn/${aptosHash}?network=${aptosNetwork}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'underline' }}>
                    View on Aptos Explorer â†—
                  </a>
                </div>
              )}
            </>
          )}

          <button onClick={handlePublish} disabled={publishing || !hash}
            style={{ padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', borderRadius: 4, border: '1px solid #d1d5db' }}>
            {publishing ? 'Publishingâ€¦' : '4. Publish to Shelby'}
          </button>
          {publishStatus && (
            <p style={{ margin: 0, color: publishStatus.startsWith('Error') ? 'red' : 'green' }}>{publishStatus}</p>
          )}
        </div>
      )}

      {/* â”€â”€ Verify â”€â”€ */}
      {tab === 'verify' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 style={{ margin: 0 }}>Verify Authorship</h2>
          <p style={{ margin: 0, color: '#6b7280', fontSize: 14 }}>
            Paste a SHA-256 hash to verify the Shelby record, Ed25519 signature, and Aptos on-chain anchor.
          </p>
          <textarea placeholder="sha256:abc123â€¦" value={verifyHash}
            onChange={e => setVerifyHash(e.target.value)} rows={2}
            style={{ ...inp, ...mono, fontSize: 13 }} />
          <button onClick={handleVerify} disabled={verifying || !verifyHash.trim()}
            style={{ padding: '8px', cursor: 'pointer', borderRadius: 4, border: '1px solid #d1d5db' }}>
            {verifying ? 'Verifyingâ€¦' : 'Verify'}
          </button>

          {verifyResult !== null && (() => {
            const { found, post, sigValid, onChain } = verifyResult
            if (!found || !post) {
              return (
                <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 6, padding: 12 }}>
                  <p style={{ margin: 0, color: '#991b1b', fontWeight: 'bold' }}>âœ— No post found for this hash.</p>
                </div>
              )
            }
            return (
              <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: 14 }}>
                <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <span style={badge('green')}>âœ“ Hash Matched</span>
                  {post.signature && post.publicKey && post.signedMessage
                    ? <span style={badge(sigValid ? 'green' : 'red')}>{sigValid ? 'âœ“ Signature Valid' : 'âœ— Signature Invalid'}</span>
                    : <span style={badge('gray')}>âš  No Signature</span>}
                  {onChain === true
                    ? <span style={badge('blue')}>âœ“ On-Chain Verified</span>
                    : onChain === false
                      ? <span style={badge('red')}>âœ— Not On-Chain</span>
                      : post.aptosHash
                        ? <span style={badge('gray')}>â³ Checking chainâ€¦</span>
                        : <span style={badge('gray')}>âš  Not Anchored</span>}
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>{post.title}</h3>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6b7280' }}>
                  by <strong>{post.author}</strong> Â· {new Date(post.date).toLocaleString()}
                </p>
                <p style={{ margin: '0 0 10px', fontSize: 14 }}>{post.body}</p>
                <div style={{ ...mono, fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{post.hash}</div>
                {post.walletAddress && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    <strong>Wallet:</strong> <span style={mono}>{post.walletAddress}</span>
                  </div>
                )}
                {post.aptosHash && (
                  <div style={{ fontSize: 12, color: '#1e40af', marginTop: 4 }}>
                    <strong>Aptos Txn ({post.aptosNetwork}):</strong>{' '}
                    <a href={`https://explorer.aptoslabs.com/txn/${post.aptosHash}?network=${post.aptosNetwork}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: '#1d4ed8', textDecoration: 'underline', fontSize: 11 }}>
                      View â†—
                    </a>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* â”€â”€ Feed â”€â”€ */}
      {tab === 'feed' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Feed</h2>
            <button onClick={loadFeed} disabled={feedLoading}
              style={{ padding: '4px 12px', cursor: 'pointer', borderRadius: 4, border: '1px solid #d1d5db' }}>
              {feedLoading ? 'Refreshingâ€¦' : 'Refresh'}
            </button>
          </div>
          {feedLoading && <p style={{ color: '#6b7280' }}>Loadingâ€¦</p>}
          {feedError && <p style={{ color: 'red' }}>{feedError}</p>}
          {!feedLoading && !feedError && posts.length === 0 && <p style={{ color: '#6b7280' }}>No posts yet.</p>}
          {posts.map((post, i) => (
            <div key={i} style={{ borderBottom: '1px solid #e5e7eb', marginBottom: 16, paddingBottom: 16 }}>
              <h3 style={{ margin: '0 0 4px' }}>{post.title}</h3>
              <p style={{ margin: '0 0 6px', color: '#6b7280', fontSize: 13 }}>
                by <strong>{post.author}</strong> Â· {new Date(post.date).toLocaleString()}
                {post.signature && (
                  <span style={{ marginLeft: 6, fontSize: 11, background: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: 10, fontWeight: 'bold' }}>
                    âœ“ Signed
                  </span>
                )}
                {post.aptosHash && (
                  <a href={`https://explorer.aptoslabs.com/txn/${post.aptosHash}?network=${post.aptosNetwork}`}
                    target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', marginLeft: 6 }}>
                    <span style={{ fontSize: 11, background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 10, fontWeight: 'bold' }}>
                      â›“ On-Chain â†—
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
