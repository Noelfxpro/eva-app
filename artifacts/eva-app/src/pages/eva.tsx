import { useState, useEffect, useCallback } from 'react'
import { useGetFeed, usePublishPost } from '@workspace/api-client-react'

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
const ANCHOR_SCRIPT_BYTECODE =
  '0xa11ceb0b0900000a0405000607060e08142010341f02060c0a0200083c53454c463e5f30046d61696e' +
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff14636f6d70696c6174' +
  '696f6e5f6d65746164617461090003322e3003322e3300000101030b000102'

const APTOS_NETWORKS = ['devnet', 'testnet', 'mainnet'] as const
type AptosNetwork = typeof APTOS_NETWORKS[number]

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0a',
  card: '#141414',
  card2: '#1c1c1c',
  green: '#00FF94',
  greenDim: 'rgba(0,255,148,0.12)',
  greenBorder: 'rgba(0,255,148,0.3)',
  white: '#ffffff',
  gray: '#888888',
  grayDim: '#555555',
  border: '#252525',
  red: '#ff4d4d',
  redDim: 'rgba(255,77,77,0.12)',
  blue: '#4da6ff',
  blueDim: 'rgba(77,166,255,0.12)',
  mono: "'Courier New', Courier, monospace" as string,
  hero: "'Arial Black', 'Arial Bold', Impact, sans-serif" as string,
}

// ── Crypto helpers ────────────────────────────────────────────────────────────
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const buf = new Uint8Array(clean.length / 2)
  for (let i = 0; i < buf.length; i++) buf[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return buf
}

async function verifyEd25519(signature: string, message: string, publicKey: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', hexToBytes(publicKey), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify('Ed25519', key, hexToBytes(signature), new TextEncoder().encode(message))
  } catch { return false }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Post {
  author: string; title: string; body: string; hash: string
  signature: string | null; publicKey: string | null; signedMessage: string | null
  walletAddress: string | null; aptosHash: string | null; aptosNetwork: string | null
  date: string
}

// ── Reusable style helpers ─────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  background: '#1a1a1a', border: `1px solid ${C.border}`, color: C.white,
  padding: '10px 12px', fontSize: 13, fontFamily: C.mono, outline: 'none',
  width: '100%', boxSizing: 'border-box', borderRadius: 2,
}

function badge(variant: 'green' | 'red' | 'gray' | 'blue'): React.CSSProperties {
  const map = {
    green: { bg: C.greenDim, color: C.green, border: C.greenBorder },
    red:   { bg: C.redDim,   color: C.red,   border: 'rgba(255,77,77,0.3)' },
    blue:  { bg: C.blueDim,  color: C.blue,  border: 'rgba(77,166,255,0.3)' },
    gray:  { bg: 'rgba(255,255,255,0.05)', color: C.gray, border: '#333' },
  }[variant]
  return {
    display: 'inline-block', padding: '3px 10px', borderRadius: 2, marginRight: 6,
    fontSize: 11, fontWeight: 700, fontFamily: C.mono, letterSpacing: 0.5,
    background: map.bg, color: map.color, border: `1px solid ${map.border}`,
  }
}

function Btn({ onClick, disabled, primary, children, title }: {
  onClick?: () => void; disabled?: boolean; primary?: boolean
  children: React.ReactNode; title?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      background: primary ? C.green : 'transparent',
      color: primary ? '#000' : C.green,
      border: primary ? 'none' : `1px solid ${C.green}`,
      padding: primary ? '12px 20px' : '10px 16px',
      fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: 1,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      width: '100%', textTransform: 'uppercase' as const, borderRadius: 2,
      transition: 'opacity 0.15s',
    }}>
      {children}
    </button>
  )
}

function StatCard({ label, value, full }: { label: string; value: string | number; full?: boolean }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderTop: `2px solid ${C.green}`,
      padding: '16px 18px', gridColumn: full ? '1 / -1' : undefined,
    }}>
      <div style={{ fontFamily: C.mono, fontSize: full ? 16 : 26, fontWeight: 700, color: C.green, marginBottom: 6 }}>
        {value}
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.gray, letterSpacing: 1 }}>{label}</div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')

  // Publish state
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
  const [publishStatus, setPublishStatus] = useState<string | null>(null)

  // Verify state
  const [verifyHash, setVerifyHash] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{
    found: boolean; post: Post | null; sigValid?: boolean; onChain: boolean | null
  } | null>(null)

  const feedQuery = useGetFeed()
  const publishMutation = usePublishPost()

  const posts = feedQuery.data?.posts ?? []
  const verifiedCount = posts.length
  const authorCount = new Set(posts.map(p => p.author)).size
  const latestHash = posts[0]?.hash ? posts[0].hash.slice(7, 23) + '…' : '—'

  useEffect(() => {
    setSignature(null); setPublicKey(null); setSignedMessage(null); setAptosHash(null)
  }, [hash])

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const generateHash = async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(author + title + body))
    setHash('sha256:' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''))
  }

  const connectWallet = useCallback(async () => {
    if (!window.aptos) { alert('Petra Wallet not detected. Install from https://petra.app'); return }
    try { const r = await window.aptos.connect(); setWallet(r.address) }
    catch { alert('Wallet connection cancelled.') }
  }, [])

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
        type: 'script_payload', code: { bytecode: ANCHOR_SCRIPT_BYTECODE },
        type_arguments: [], arguments: [hashHex],
      })
      setAptosHash(result.hash)
    } catch (err) { alert('Anchoring failed: ' + (err instanceof Error ? err.message : String(err))) }
    finally { setAnchoring(false) }
  }

  const handlePublish = () => {
    if (!author || !title || !body || !hash) { alert('Fill in all fields and generate a hash first.'); return }
    setPublishStatus(null)
    publishMutation.mutate(
      { data: { author, title, body, hash, signature, publicKey, signedMessage, walletAddress: wallet, aptosHash, aptosNetwork: aptosHash ? aptosNetwork : null } },
      {
        onSuccess: () => {
          setPublishStatus('success')
          setAuthor(''); setTitle(''); setBody(''); setHash('')
          setSignature(null); setPublicKey(null); setSignedMessage(null); setAptosHash(null)
          feedQuery.refetch()
        },
        onError: (err: unknown) => setPublishStatus('Error: ' + (err instanceof Error ? err.message : 'Failed')),
      }
    )
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
      if (post?.signature && post.publicKey && post.signedMessage)
        sigValid = await verifyEd25519(post.signature, post.signedMessage, post.publicKey)
      setVerifyResult({ found: data.found, post, sigValid, onChain: data.onChain ?? null })
    } catch { setVerifyResult({ found: false, post: null, onChain: null }) }
    finally { setVerifying(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: C.bg, minHeight: '100vh', color: C.white,
      fontFamily: C.mono,
      backgroundImage:
        'linear-gradient(rgba(0,255,148,0.025) 1px, transparent 1px),' +
        'linear-gradient(90deg, rgba(0,255,148,0.025) 1px, transparent 1px)',
      backgroundSize: '48px 48px',
    }}>
      <style>{`
        * { box-sizing: border-box; }
        ::selection { background: rgba(0,255,148,0.25); }
        ::-webkit-scrollbar { width: 6px; background: #111; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        input::placeholder, textarea::placeholder { color: #444; }
        input:focus, textarea:focus, select:focus { border-color: #00FF94 !important; outline: none; }
        select option { background: #1a1a1a; color: #fff; }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.green, fontSize: 10, lineHeight: 1 }}>●</span>
          <span style={{ fontFamily: C.hero, fontWeight: 900, fontSize: 20, letterSpacing: 3, color: C.white }}>
            EVA
          </span>
        </div>
        <span style={{
          border: `1px solid ${C.green}`, color: C.green, padding: '5px 12px',
          fontSize: 10, letterSpacing: 2, fontFamily: C.mono, fontWeight: 700,
        }}>
          SHELBY TESTNET
        </span>
      </header>

      {/* ── Hero ── */}
      <section style={{ padding: '40px 24px 32px', maxWidth: 680, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 24px', lineHeight: 1.05, fontFamily: C.hero }}>
          <span style={{ display: 'block', fontSize: 'clamp(36px, 8vw, 56px)', fontWeight: 900, color: C.white }}>
            Your words.
          </span>
          <span style={{ display: 'block', fontSize: 'clamp(36px, 8vw, 56px)', fontWeight: 900, color: C.green }}>
            Verified.
          </span>
          <span style={{ display: 'block', fontSize: 'clamp(36px, 8vw, 56px)', fontWeight: 900, color: C.white }}>
            Forever.
          </span>
        </h1>

        <p style={{ margin: '0 0 28px', color: C.gray, fontSize: 13, lineHeight: 1.7, fontFamily: C.mono }}>
          EVA stamps every piece of Web3 content with a cryptographic proof of authorship —
          stored on Shelby's hot storage, readable sub-second, immutable on-chain.
        </p>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <StatCard label="Verified Posts" value={verifiedCount} />
          <StatCard label="Authors" value={authorCount} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', marginBottom: 24 }}>
          <StatCard label="Latest Hash" value={latestHash} full />
        </div>

        {/* Info card */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, padding: '16px 18px',
          display: 'flex', gap: 14, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.white, marginBottom: 6 }}>
              Powered by Shelby Hot Storage
            </div>
            <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.6 }}>
              Each post is stored as a blob on Shelby Protocol. The SHA-256 hash is
              the content's fingerprint — anyone can verify authorship by matching
              the hash, checking the Ed25519 signature, and confirming the Aptos anchor.
            </div>
          </div>
        </div>
      </section>

      {/* ── Tabs ── */}
      <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', maxWidth: 680, margin: '0 auto', padding: '0 24px' }}>
          {(['publish', 'verify', 'feed'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: 'none', border: 'none', padding: '14px 20px',
              fontFamily: C.mono, fontSize: 12, letterSpacing: 2, fontWeight: 700,
              color: tab === t ? C.green : C.grayDim, cursor: 'pointer',
              borderBottom: tab === t ? `2px solid ${C.green}` : '2px solid transparent',
              textTransform: 'uppercase', transition: 'color 0.15s',
            }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 24px 60px' }}>

        {/* ── PUBLISH ── */}
        {tab === 'publish' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Wallet row */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={connectWallet} style={{
                flex: 1, background: 'transparent', border: `1px solid ${wallet ? C.green : C.border}`,
                color: wallet ? C.green : C.gray, padding: '10px 14px', fontFamily: C.mono,
                fontSize: 12, letterSpacing: 1, cursor: 'pointer', borderRadius: 2, fontWeight: 700,
              }}>
                {wallet ? `● ${wallet.slice(0, 8)}…${wallet.slice(-6)}` : 'Connect Petra Wallet'}
              </button>
              <select value={aptosNetwork} onChange={e => setAptosNetwork(e.target.value as AptosNetwork)}
                style={{
                  background: '#1a1a1a', border: `1px solid ${C.border}`, color: C.green,
                  padding: '8px 12px', fontFamily: C.mono, fontSize: 11, letterSpacing: 1,
                  cursor: 'pointer', borderRadius: 2, fontWeight: 700,
                }}>
                {APTOS_NETWORKS.map(n => <option key={n} value={n}>{n.toUpperCase()}</option>)}
              </select>
            </div>

            <input placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)} style={inp} />
            <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} style={inp} />
            <textarea placeholder="Content" value={body} onChange={e => setBody(e.target.value)}
              rows={6} style={{ ...inp, resize: 'vertical' }} />

            {/* Step 1 — Hash */}
            <Btn onClick={generateHash} disabled={!author || !title || !body} primary>
              1. Generate SHA-256 Hash
            </Btn>

            {hash && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.green}`, padding: 12 }}>
                <div style={{ fontSize: 10, color: C.green, letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>SHA-256 HASH</div>
                <div style={{ fontFamily: C.mono, fontSize: 11, color: C.gray, wordBreak: 'break-all' }}>{hash}</div>
              </div>
            )}

            {/* Step 2 — Sign */}
            {hash && (
              <>
                <Btn onClick={signWithPetra} disabled={signing || !wallet} title={!wallet ? 'Connect Petra Wallet first' : ''}>
                  {signing ? 'Waiting for Petra…' : signature ? '✓ Signed with Petra' : '2. Sign with Petra Wallet'}
                </Btn>
                {!wallet && (
                  <p style={{ margin: 0, fontSize: 11, color: '#b45309', fontFamily: C.mono }}>
                    ⚠ Connect wallet above to enable signing and anchoring.
                  </p>
                )}
                {signature && (
                  <div style={{ background: C.card, border: `1px solid ${C.greenBorder}`, borderLeft: `3px solid ${C.green}`, padding: 12 }}>
                    <div style={{ fontSize: 10, color: C.green, letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>✓ SIGNED — Ed25519</div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.gray }}>{signature.slice(0, 36)}…</div>
                  </div>
                )}
              </>
            )}

            {/* Step 3 — Anchor */}
            {hash && (
              <>
                <Btn onClick={anchorOnAptos} disabled={anchoring || !wallet} title={!wallet ? 'Connect Petra Wallet first' : ''}>
                  {anchoring ? 'Submitting to Aptos…' : aptosHash ? `✓ Anchored on ${aptosNetwork.toUpperCase()}` : `3. Anchor on Aptos (${aptosNetwork.toUpperCase()})`}
                </Btn>
                {aptosHash && (
                  <div style={{ background: C.card, border: `1px solid rgba(77,166,255,0.3)`, borderLeft: `3px solid ${C.blue}`, padding: 12 }}>
                    <div style={{ fontSize: 10, color: C.blue, letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>
                      ✓ ON-CHAIN — APTOS {aptosNetwork.toUpperCase()}
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 11, color: C.gray, marginBottom: 8, wordBreak: 'break-all' }}>
                      {aptosHash.slice(0, 32)}…{aptosHash.slice(-12)}
                    </div>
                    <a href={`https://explorer.aptoslabs.com/txn/${aptosHash}?network=${aptosNetwork}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: C.blue, textDecoration: 'underline', fontFamily: C.mono }}>
                      View on Aptos Explorer ↗
                    </a>
                  </div>
                )}
              </>
            )}

            {/* Step 4 — Publish */}
            <Btn onClick={handlePublish} disabled={publishMutation.isPending || !hash} primary>
              {publishMutation.isPending ? 'Publishing…' : '4. Publish to Shelby'}
            </Btn>

            {publishStatus && (
              <div style={{
                background: publishStatus === 'success' ? C.greenDim : C.redDim,
                border: `1px solid ${publishStatus === 'success' ? C.greenBorder : 'rgba(255,77,77,0.3)'}`,
                padding: '10px 14px', fontSize: 12, fontFamily: C.mono,
                color: publishStatus === 'success' ? C.green : C.red,
              }}>
                {publishStatus === 'success' ? '✓ Published successfully!' : publishStatus}
              </div>
            )}
          </div>
        )}

        {/* ── VERIFY ── */}
        {tab === 'verify' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: '0 0 4px', color: C.gray, fontSize: 12, lineHeight: 1.6 }}>
              Paste a SHA-256 hash to verify the Shelby record, Ed25519 signature, and Aptos on-chain anchor.
            </p>

            <textarea placeholder="sha256:abc123…" value={verifyHash}
              onChange={e => setVerifyHash(e.target.value)} rows={2}
              style={{ ...inp, fontSize: 12 }} />

            <Btn onClick={handleVerify} disabled={verifying || !verifyHash.trim()} primary>
              {verifying ? 'Verifying…' : 'Verify'}
            </Btn>

            {verifyResult !== null && (() => {
              const { found, post, sigValid, onChain } = verifyResult
              if (!found || !post) {
                return (
                  <div style={{ background: C.redDim, border: `1px solid rgba(255,77,77,0.3)`, borderLeft: `3px solid ${C.red}`, padding: 14 }}>
                    <p style={{ margin: 0, color: C.red, fontWeight: 700, fontSize: 13 }}>✗ No post found for this hash.</p>
                  </div>
                )
              }
              return (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, padding: 16 }}>
                  <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
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

                  <h3 style={{ margin: '0 0 4px', fontSize: 16, fontFamily: C.hero, color: C.white }}>{post.title}</h3>
                  <p style={{ margin: '0 0 10px', fontSize: 12, color: C.grayDim }}>
                    by <span style={{ color: C.white }}>{post.author}</span> · {new Date(post.date).toLocaleString()}
                  </p>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: C.gray, lineHeight: 1.6 }}>{post.body}</p>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.grayDim, wordBreak: 'break-all', marginBottom: 10 }}>{post.hash}</div>

                  {post.walletAddress && (
                    <div style={{ fontSize: 11, color: C.grayDim, marginBottom: 4, fontFamily: C.mono }}>
                      <span style={{ color: C.gray }}>wallet </span>{post.walletAddress}
                    </div>
                  )}
                  {post.publicKey && (
                    <div style={{ fontSize: 11, color: C.grayDim, marginBottom: 4, fontFamily: C.mono }}>
                      <span style={{ color: C.gray }}>pubkey </span>{post.publicKey.slice(0, 20)}…{post.publicKey.slice(-12)}
                    </div>
                  )}
                  {post.signature && (
                    <div style={{ fontSize: 11, color: C.grayDim, marginBottom: 4, fontFamily: C.mono }}>
                      <span style={{ color: C.gray }}>sig    </span>{post.signature.slice(0, 20)}…{post.signature.slice(-12)}
                    </div>
                  )}
                  {post.aptosHash && (
                    <div style={{ fontSize: 11, color: C.blue, marginTop: 8, fontFamily: C.mono }}>
                      <span style={{ color: C.gray }}>aptos  </span>
                      {post.aptosHash.slice(0, 20)}…{post.aptosHash.slice(-12)}{' '}
                      <a href={`https://explorer.aptoslabs.com/txn/${post.aptosHash}?network=${post.aptosNetwork}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: C.blue, textDecoration: 'underline' }}>↗</a>
                      <span style={{ color: C.grayDim }}> ({post.aptosNetwork})</span>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── FEED ── */}
        {tab === 'feed' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ color: C.gray, fontSize: 12, letterSpacing: 1 }}>
                {verifiedCount} post{verifiedCount !== 1 ? 's' : ''} indexed
              </span>
              <button onClick={() => feedQuery.refetch()} disabled={feedQuery.isFetching} style={{
                background: 'transparent', border: `1px solid ${C.border}`, color: C.grayDim,
                padding: '6px 14px', fontFamily: C.mono, fontSize: 10, letterSpacing: 1,
                cursor: 'pointer', fontWeight: 700,
              }}>
                {feedQuery.isFetching ? 'Refreshing…' : '↻ Refresh'}
              </button>
            </div>

            {feedQuery.isLoading && <p style={{ color: C.gray, fontSize: 12 }}>Loading…</p>}
            {feedQuery.isError && <p style={{ color: C.red, fontSize: 12 }}>Error loading feed.</p>}
            {!feedQuery.isLoading && posts.length === 0 && (
              <p style={{ color: C.grayDim, fontSize: 12 }}>No posts yet. Be the first to publish.</p>
            )}

            {posts.map((post, i) => (
              <div key={i} style={{
                borderBottom: `1px solid ${C.border}`, marginBottom: 20, paddingBottom: 20,
              }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  {post.signature && (
                    <span style={{ fontSize: 10, background: C.greenDim, color: C.green, padding: '2px 8px', fontWeight: 700, letterSpacing: 1, border: `1px solid ${C.greenBorder}` }}>
                      ✓ SIGNED
                    </span>
                  )}
                  {post.aptosHash && (
                    <a href={`https://explorer.aptoslabs.com/txn/${post.aptosHash}?network=${post.aptosNetwork}`}
                      target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      <span style={{ fontSize: 10, background: C.blueDim, color: C.blue, padding: '2px 8px', fontWeight: 700, letterSpacing: 1, border: `1px solid rgba(77,166,255,0.3)` }}>
                        ⛓ ON-CHAIN ↗
                      </span>
                    </a>
                  )}
                </div>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, fontFamily: C.hero, color: C.white, fontWeight: 900 }}>
                  {post.title}
                </h3>
                <p style={{ margin: '0 0 8px', fontSize: 11, color: C.grayDim }}>
                  {post.author} · {new Date(post.date).toLocaleString()}
                </p>
                <p style={{ margin: '0 0 8px', fontSize: 13, color: C.gray, lineHeight: 1.6 }}>{post.body}</p>
                <p style={{ margin: 0, fontFamily: C.mono, fontSize: 10, color: '#3a3a3a', wordBreak: 'break-all' }}>{post.hash}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
