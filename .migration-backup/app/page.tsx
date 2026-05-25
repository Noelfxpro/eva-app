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

  const connectWallet = async () => {
    if (typeof window === 'undefined') return

    if (!window.aptos) {
      alert("Install Petra Wallet")
      return
    }

    try {
      const res = await window.aptos.connect()
      setWallet(res.address)
    } catch {
      alert("Connection cancelled")
    }
  }

  return (
    <div style={{ padding: 30, fontFamily: 'Arial' }}>
      <h1>EVA 🚀</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setTab('publish')}>Publish</button>
        <button onClick={() => setTab('verify')}>Verify</button>
        <button onClick={() => setTab('feed')}>Feed</button>
      </div>

      {tab === 'publish' && (
        <div>
          <h2>Publish</h2>

          <button onClick={connectWallet}>
            Connect Petra Wallet
          </button>

          {wallet && <p>Connected: {wallet}</p>}

          <input placeholder="Author" value={author} onChange={e => setAuthor(e.target.value)} />
          <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} />

          <textarea placeholder="Content" value={body} onChange={e => setBody(e.target.value)} />

          <button onClick={generateHash}>
            Generate SHA-256
          </button>

          {hash && <p>{hash}</p>}
        </div>
      )}

      {tab === 'verify' && <h2>Verify (coming)</h2>}
      {tab === 'feed' && <h2>Feed (coming)</h2>}
    </div>
  )
}
