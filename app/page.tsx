'use client'

import { useState } from 'react'

export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [hash, setHash] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)

  const generateHash = async () => {
    const msg = author + title + body
    const enc = new TextEncoder().encode(msg)
    const buf = await crypto.subtle.digest('SHA-256', enc)
    const arr = Array.from(new Uint8Array(buf))
    const h = 'sha256:' + arr.map(b => b.toString(16).padStart(2, '0')).join('')
    setHash(h)
  }

  // 🔐 SAFE WALLET FUNCTION (IMPORTANT FIX BUILD VERCEL)
  const connectWallet = async () => {
    if (typeof window === 'undefined') return

    if (!window.aptos) {
      alert("Install Petra Wallet")
      return
    }

    try {
      const res = await window.aptos.connect()
      setWallet(res.address)
      alert("Wallet connected: " + res.address)
    } catch {
      alert("Connection cancelled")
    }
  }

  return (
    <div style={{ padding: 30, fontFamily: 'Arial' }}>
      <h1>EVA 🚀</h1>

      {/* NAVIGATION */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setTab('publish')}>Publish</button>
        <button onClick={() => setTab('verify')}>Verify</button>
        <button onClick={() => setTab('feed')}>Feed</button>
      </div>

      {/* PUBLISH */}
      {tab === 'publish' && (
        <div>
          <h2>Publish</h2>

          {/* WALLET BUTTON */}
          <button onClick={connectWallet}>
            Connect Petra Wallet
          </button>

          {wallet && (
            <p style={{ marginTop: 10 }}>
              Connected: {wallet}
            </p>
          )}

          <br />

          <input
            placeholder="Author"
            value={author}
            onChange={e => setAuthor(e.target.value)}
          />
          <br />

          <input
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
          <br />

          <textarea
            placeholder="Content"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
          <br />

          <button onClick={generateHash}>
            Generate SHA-256
          </button>

          {hash && (
            <p style={{ marginTop: 10 }}>
              Hash: {hash}
            </p>
          )}
        </div>
      )}

      {/* VERIFY */}
      {tab === 'verify' && (
        <div>
          <h2>Verify</h2>
          <p>Next step: verification system</p>
        </div>
      )}

      {/* FEED */}
      {tab === 'feed' && (
        <div>
          <h2>Feed</h2>
          <p>Next step: API integration</p>
        </div>
      )}
    </div>
  )
          }
