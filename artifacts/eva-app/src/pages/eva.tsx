import { useState } from 'react'
import { useGetFeed, usePublishPost } from '@workspace/api-client-react'

// Extend Window to support Petra Wallet
declare global {
  interface Window {
    aptos?: {
      connect: () => Promise<{ address: string }>
    }
  }
}

export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [hash, setHash] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)
  const [publishStatus, setPublishStatus] = useState<string | null>(null)

  const feedQuery = useGetFeed({ query: { enabled: tab === 'feed' } })
  const publishMutation = usePublishPost()

  const generateHash = async () => {
    const msg = author + title + body
    const enc = new TextEncoder().encode(msg)
    const buf = await crypto.subtle.digest('SHA-256', enc)
    const arr = Array.from(new Uint8Array(buf))
    const h = 'sha256:' + arr.map(b => b.toString(16).padStart(2, '0')).join('')
    setHash(h)
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

  const handlePublish = async () => {
    if (!author || !title || !body || !hash) {
      alert('Please fill in all fields and generate a hash first.')
      return
    }
    setPublishStatus(null)
    publishMutation.mutate(
      {
        data: {
          author,
          title,
          body,
          hash,
          signature: null,
          walletAddress: wallet,
        },
      },
      {
        onSuccess: () => {
          setPublishStatus('Published successfully!')
          setAuthor('')
          setTitle('')
          setBody('')
          setHash('')
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Failed to publish'
          setPublishStatus('Error: ' + msg)
        },
      }
    )
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 500 }}>
          <h2>Publish</h2>

          <button onClick={connectWallet}>
            Connect Petra Wallet
          </button>

          {wallet && <p>Connected: {wallet}</p>}

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

          <button onClick={generateHash}>
            Generate SHA-256
          </button>

          {hash && <p style={{ wordBreak: 'break-all' }}>{hash}</p>}

          <button
            onClick={handlePublish}
            disabled={publishMutation.isPending}
            style={{ padding: '10px 20px', cursor: 'pointer' }}
          >
            {publishMutation.isPending ? 'Publishing...' : 'Publish to Shelby'}
          </button>

          {publishStatus && (
            <p style={{ color: publishStatus.startsWith('Error') ? 'red' : 'green' }}>
              {publishStatus}
            </p>
          )}
        </div>
      )}

      {tab === 'verify' && <h2>Verify (coming)</h2>}

      {tab === 'feed' && (
        <div>
          <h2>Feed</h2>
          {feedQuery.isLoading && <p>Loading posts...</p>}
          {feedQuery.isError && <p>Error loading feed.</p>}
          {feedQuery.data && (
            feedQuery.data.posts.length === 0
              ? <p>No posts yet.</p>
              : feedQuery.data.posts.map((post, i) => (
                <div key={i} style={{ borderBottom: '1px solid #ccc', marginBottom: 16, paddingBottom: 16 }}>
                  <h3 style={{ margin: '0 0 4px' }}>{post.title}</h3>
                  <p style={{ margin: '0 0 4px', color: '#555', fontSize: 13 }}>
                    by {post.author} · {new Date(post.date).toLocaleString()}
                  </p>
                  <p style={{ margin: '0 0 4px' }}>{post.body}</p>
                  <p style={{ margin: 0, fontSize: 12, color: '#888', wordBreak: 'break-all' }}>
                    {post.hash}
                  </p>
                  {post.walletAddress && (
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>
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
