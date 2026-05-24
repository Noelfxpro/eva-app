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
      alert("Wallet connected: " + res.address)
    } catch {
      alert("Connection cancelled")
    }
  }

  return (
    <div style={{ padding: 30, fontFamily: 'Arial' }}>
      <h1>EVA 🚀 TEST LIVE</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setTab('publish')}>Publish</button>
        <button onClick={() => setTab('verify')}>Verify</button>
        <button onClick={() => setTab('feed')}>Feed</button>
      </div>

      {tab === 'publish' && (
        <div>
          <h2>Publish</h2>

          {/* 🔥 TEST AJOUTÉ */}
          <p>TEST PETRA BUTTON AREA</p>

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
