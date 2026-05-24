'use client'

import { useState } from 'react'

export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')

  return (
    <div style={{ padding: 30, fontFamily: 'Arial' }}>
      <h1>EVA 🚀</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button onClick={() => setTab('publish')}>Publish</button>
        <button onClick={() => setTab('verify')}>Verify</button>
        <button onClick={() => setTab('feed')}>Feed</button>
      </div>

      {/* PUBLISH */}
      {tab === 'publish' && (
        <div>
          <h2>Publish</h2>
          <p>Form coming next step</p>
        </div>
      )}

      {/* VERIFY */}
      {tab === 'verify' && (
        <div>
          <h2>Verify</h2>
          <p>Verification coming next step</p>
        </div>
      )}

      {/* FEED */}
      {tab === 'feed' && (
        <div>
          <h2>Feed</h2>
          <p>Feed coming next step</p>
        </div>
      )}
    </div>
  )
}
