
'use client'
import { useState, useEffect, useCallback } from 'react'

interface Post {
  author: string
  title: string
  body: string
  hash: string
  signature?: string
  walletAddress?: string
  date: string
}

declare global {
  interface Window {
    aptos?: {
      connect: () => Promise<{ address: string }>
      disconnect: () => Promise<void>
      signMessage: (opts: { message: string; nonce: string }) => Promise<{ signature: string }>
      account: () => Promise<{ address: string }>
    }
  }
}

export default function EVA() {
  const [tab, setTab] = useState<'publish' | 'verify' | 'feed'>('publish')
  const [author, setAuthor] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [toast, setToast] = useState('')
  const [wallet, setWallet] = useState<string | null>(null)
  const [verifyContent, setVerifyContent] = useState('')
  const [verifyHash, setVerifyHash] = useState('')
  const [verifyResult, setVerifyResult] = useState<null | 'match' | 'nomatch'>(null)
  const [publishing, setPublishing] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const sha256 = async (message: string) => {
    const buf = new TextEncoder().encode(message)
    const hash = await crypto.subtle.digest('SHA-256', buf)
    const arr = Array.from(new Uint8Array(hash))
    return 'sha256:' + arr.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  const connectWallet = async () => {
    if (!window.aptos) return showToast('Install Petra Wallet')
    try {
      const res = await window.aptos.connect()
      setWallet(res.address)
      showToast('Wallet connected')
    } catch { showToast('Connection cancelled') }
  }

  const disconnectWallet = async () => {
    if (window.aptos) await window.aptos.disconnect()
    setWallet(null)
  }

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/feed')
      const data = await res.json()
      setPosts(data.posts || [])
    } catch {}
  }, [])

  useEffect(() => {
    if (tab === 'feed') loadFeed()
  }, [tab, loadFeed])

  const publish = async () => {
    if (!author || !title || !body) return showToast('Fill all fields')
    if (!wallet) return showToast('Connect Petra wallet first')
    setPublishing(true)
    try {
      const content = `${title}\n\n${body}`
      const hash = await sha256(content)
      showToast('Sign in Petra wallet...')
      let signature = null
      if (window.aptos) {
        try {
          const res = await window.aptos.signMessage({
            message: `EVA Authorship Proof\nHash: ${hash}\nAuthor: ${author}`,
            nonce: Date.now().toString(),
          })
          signature = res.signature
        } catch { showToast('Signature refused'); setPublishing(false); return }
      }
      showToast('Uploading to Shelby...')
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, title, body, hash, signature, walletAddress: wallet }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTitle(''); setBody('')
      showToast('Stamped on Shelby!')
      setTab('feed')
    } catch (err: unknown) {
      showToast('Error: ' + (err instanceof Error ? err.message : 'Unknown'))
    }
    setPublishing(false)
  }

  const verify = async () => {
    if (!verifyContent || !verifyHash) return showToast('Fill both fields')
    const hash = await sha256(verifyContent)
    setVerifyResult(hash === verifyHash ? 'match' : 'nomatch')
  }

  const short = (addr: string) => addr.slice(0,6)+'...'+addr.slice(-4)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Space+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{background:#0a0a0f;color:#e8e8f0;font-family:'Space Mono',monospace;min-height:100vh}
        body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background-image:linear-gradient(rgba(0,255,163,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,255,163,.03) 1px,transparent 1px);background-size:48px 48px}
        .w{position:relative;z-index:1;max-width:860px;margin:0 auto;padding:0 20px}
        header{padding:32px 0 24px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #1e1e2e}
        .logo{font-family:'Syne',sans-serif;font-weight:800;font-size:26px;display:flex;align-items:center;gap:10px}
        .dot{width:10px;height:10px;border-radius:50%;background:#00ffa3;box-shadow:0 0 12px #00ffa3;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.8)}}
        .hr{display:flex;align-items:center;gap:12px}
        .badge{font-size:11px;padding:4px 10px;border:1px solid #00ffa3;color:#00ffa3;border-radius:2px;letter-spacing:1px;text-transform:uppercase}
        .wb{font-family:'Space Mono',monospace;font-size:11px;padding:6px 14px;border-radius:2px;cursor:pointer;transition:all .2s}
        .wc{border:1px solid #00ffa3;color:#00ffa3;background:rgba(0,255,163,.05)}
        .wd{border:1px solid #1e1e2e;color:#6b6b8a;background:transparent}
        .wb:hover{border-color:#00ffa3;color:#00ffa3}
        .hero{padding:48px 0 36px;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
        @media(max-width:600px){.hero{grid-template-columns:1fr}}
        .ht{font-family:'Syne',sans-serif;font-weight:800;font-size:clamp(32px,5vw,52px);line-height:1.05;letter-spacing:-1px}
        .ht span{color:#00ffa3;display:block}
        .hs{margin-top:14px;color:#6b6b8a;font-size:13px;line-height:1.7}
        .sg{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .sb{background:#111118;border:1px solid #1e1e2e;padding:18px;border-radius:4px;position:relative;overflow:hidden}
        .sb::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#00ffa3,transparent)}
        .sn{font-family:'Syne',sans-serif;font-size:26px;font-weight:800;color:#00ffa3}
        .sl{font-size:11px;color:#6b6b8a;margin-top:4px}
        .note{background:linear-gradient(135deg,rgba(124,58,237,.08),rgba(0,255,163,.05));border:1px solid rgba(124,58,237,.3);border-radius:4px;padding:18px 22px;margin-bottom:32px;display:flex;gap:14px}
        .nt{font-size:12px;color:#6b6b8a;line-height:1.6}
        .nt strong{color:#e8e8f0;display:block;margin-bottom:3px;font-family:'Syne',sans-serif}
        .tabs{display:flex;border:1px solid #1e1e2e;border-radius:4px;overflow:hidden;margin-bottom:28px;width:fit-content}
        .tab{padding:10px 22px;font-family:'Space Mono',monospace;font-size:12px;letter-spacing:1px;text-transform:uppercase;background:transparent;border:none;color:#6b6b8a;cursor:pointer;transition:all .2s}
        .tab.active{background:#00ffa3;color:#000;font-weight:700}
        .tab:not(.active):hover{color:#e8e8f0;background:#1e1e2e}
        .card{background:#111118;border:1px solid #1e1e2e;border-radius:4px;padding:28px;margin-bottom:40px;animation:fu .3s ease both}
        @keyframes fu{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .lbl{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6b6b8a;margin-bottom:7px;display:block}
        .inp,.txta{width:100%;background:#0a0a0f;border:1px solid #1e1e2e;border-radius:3px;color:#e8e8f0;font-family:'Space Mono',monospace;font-size:13px;padding:11px 14px;outline:none;transition:border-color .2s;resize:none}
        .inp:focus,.txta:focus{border-color:#00ffa3}
        .txta{min-height:130px;line-height:1.6}
        .row{margin-bottom:18px}
        .ff{display:flex;align-items:center;justify-content:space-between;margin-top:22px;gap:14px;flex-wrap:wrap}
        .hint{font-size:11px;color:#6b6b8a;line-height:1.5}
        .btn{font-family:'Syne',sans-serif;font-weight:700;font-size:13px;letter-spacing:1px;text-transform:uppercase;padding:12px 26px;border-radius:3px;border:none;cursor:pointer;transition:all .2s;white-space:nowrap}
        .bp{background:#00ffa3;color:#000}
        .bp:hover{box-shadow:0 0 20px rgba(0,255,163,.4);transform:translateY(-1px)}
        .bp:disabled{opacity:.5;cursor:not-allowed;transform:none}
        .wr{text-align:center;padding:32px}
        .wr p{color:#6b6b8a;font-size:13px;margin-bottom:16px}
        .vr{margin-top:18px;padding:14px;border-radius:3px;font-size:13px;line-height:1.6}
        .vm{background:rgba(0,255,163,.08);border:1px solid #00ffa3;color:#00ffa3}
        .vn{background:rgba(255,77,109,.08);border:1px solid #ff4d6d;color:#ff4d6d}
        .fh{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
        .ft{font-family:'Syne',sans-serif;font-weight:700;font-size:18px}
        .pc{background:#111118;border:1px solid #1e1e2e;border-radius:4px;padding:22px;margin-bottom:14px;transition:border-color .2s;position:relative;overflow:hidden}
        .pc::after{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#00ffa3;opacity:0;transition:opacity .2s}
        .pc:hover{border-color:rgba(0,255,163,.3)}
        .pc:hover::after{opacity:1}
        .pm{display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
        .pa{font-size:12px;color:#00ffa3;font-weight:700}
        .pd{font-size:11px;color:#6b6b8a}
        .pv{font-size:10px;padding:2px 8px;background:rgba(0,255,163,.1);border:1px solid rgba(0,255,163,.3);color:#00ffa3;border-radius:2px;letter-spacing:.5px;text-transform:uppercase;margin-left:auto}
        .ps{font-size:10px;padding:2px 8px;background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.4);color:#a78bfa;border-radius:2px;letter-spacing:.5px;text-transform:uppercase}
        .ptitle{font-family:'Syne',sans-serif;font-weight:700;font-size:16px;margin-bottom:8px}
        .pb{font-size:13px;color:#6b6b8a;line-height:1.7;margin-bottom:14px}
        .hb{font-size:10px;color:#6b6b8a;background:#0a0a0f;border:1px solid #1e1e2e;padding:8px 12px;border-radius:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .hl{color:#00ffa3;text-transform:uppercase;letter-spacing:.5px;font-size:9px;white-space:nowrap}
        .hv{word-break:break-all;opacity:.7;flex:1}
        .cb{margin-left:auto;background:none;border:1px solid #1e1e2e;color:#6b6b8a;font-family:'Space Mono',monospace;font-size:10px;padding:3px 8px;border-radius:2px;cursor:pointer;white-space:nowrap;transition:all .2s}
        .cb:hover{color:#00ffa3;border-color:#00ffa3}
        .bl{font-size:10px;color:#6b6b8a;margin-top:6px}
        .bl a{color:#00ffa3;text-decoration:none}
        .empty{text-align:center;padding:60px 20px;color:#6b6b8a}
        .ei{font-size:36px;margin-bottom:14px;opacity:.4}
        .toast{position:fixed;bottom:28px;right:28px;background:#00ffa3;color:#000;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;padding:12px 20px;border-radius:3px;z-index:999;transform:translateY(80px);opacity:0;transition:all .3s cubic-bezier(.34,1.56,.64,1);pointer-events:none}
        .toast.show{transform:translateY(0);opacity:1}
        footer{border-top:1px solid #1e1e2e;padding:28px 0;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}
        .ftext{font-size:11px;color:#6b6b8a}
        .fshelby{font-size:11px;color:#6b6b8a}
        .fshelby span{color:#00ffa3}
      `}</style>
      <div className="w">
        <header>
          <div className="logo"><div className="dot"/>EVA</div>
          <div className="hr">
            <div className="badge">Shelby Testnet</div>
            {wallet
              ? <button className="wb wc" onClick={disconnectWallet}>✓ {short(wallet)}</button>
              : <button className="wb wd" onClick={connectWallet}>Connect Petra</button>
            }
          </div>
        </header>
        <div className="hero">
          <div>
            <div className="ht">Your words.<span>Verified.</span>Forever.</div>
            <p className="hs">EVA stamps every piece of Web3 content with a cryptographic proof — signed by your wallet, stored on Shelby hot storage, immutable on-chain.</p>
          </div>
          <div className="sg">
            <div className="sb"><div className="sn">{posts.length}</div><div className="sl">Verified Posts</div></div>
            <div className="sb"><div className="sn">{new Set(posts.map(p=>p.author)).size}</div><div className="sl">Authors</div></div>
            <div className="sb" style={{gridColumn:'span 2'}}><div className="sn" style={{fontSize:'14px',wordBreak:'break-all'}}>{posts[0]?.hash?.slice(0,20)||'—'}…</div><div className="sl">Latest Hash</div></div>
          </div>
        </div>
        <div className="note">
          <div style={{fontSize:'20px',flexShrink:0}}>⚡</div>
          <div className="nt"><strong>Powered by Shelby Hot Storage × Petra Wallet</strong>Each post requires a wallet signature. Content stored as a real blob on Shelby — sub-second reads, cryptographic provenance, on-chain forever.</div>
        </div>
        <div className="tabs">
          {(['publish','verify','feed'] as const).map(t=>(
            <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t}</button>
          ))}
        </div>
        {tab==='publish' && (
          !wallet
            ? <div className="card"><div className="wr"><p>Connect your Petra wallet to publish verified content on Shelby.</p><button className="btn bp" onClick={connectWallet}>Connect Petra Wallet →</button></div></div>
            : <div className="card">
                <div className="row"><label className="lbl">Your handle</label><input className="inp" value={author} onChange={e=>setAuthor(e.target.value)} placeholder="@yourname"/></div>
                <div className="row"><label className="lbl">Title</label><input className="inp" value={title} onChange={e=>setTitle(e.target.value)} placeholder="What is this about?"/></div>
                <div className="row"><label className="lbl">Content</label><textarea className="txta" value={body} onChange={e=>setBody(e.target.value)} placeholder="Write your thread, insight, or idea..."/></div>
                <div className="ff">
                  <div className="hint">1. SHA-256 hash generated<br/>2. Petra wallet signature<br/>3. Stored on Shelby</div>
                  <button className="btn bp" onClick={publish} disabled={publishing}>{publishing?'Stamping...':'Stamp & Publish →'}</button>
                </div>
              </div>
        )}
        {tab==='verify' && (
          <div className="card">
            <div className="row"><label className="lbl">Paste content to verify</label><textarea className="txta" value={verifyContent} onChange={e=>setVerifyContent(e.target.value)} placeholder="Paste original content..."/></div>
            <div className="row"><label className="lbl">Expected hash</label><input className="inp" value={verifyHash} onChange={e=>setVerifyHash(e.target.value)} placeholder="sha256:..."/></div>
            <button className="btn bp" onClick={verify}>Verify Authorship →</button>
            {verifyResult && <div className={`vr ${verifyResult==='match'?'vm':'vn'}`}>{verifyResult==='match'?'✓ AUTHORSHIP VERIFIED':'✗ VERIFICATION FAILED'}</div>}
          </div>
        )}
        {tab==='feed' && (
          <div>
            <div className="fh"><div className="ft">Verified Content</div><div style={{fontSize:'12px',color:'#6b6b8a'}}>{posts.length} posts</div></div>
            {posts.length===0
              ? <div className="empty"><div className="ei">◎</div><div>No posts yet. Be the first to stamp on Shelby.</div></div>
              : posts.map((p,i)=>(
                <div className="pc" key={i}>
                  <div className="pm">
                    <span className="pa">{p.author}</span>
                    <span className="pd">{new Date(p.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>
                    <span className="pv">✓ Verified</span>
                    {p.signature&&<span className="ps">✍ Signed</span>}
                  </div>
                  <div className="ptitle">{p.title}</div>
                  <div className="pb">{p.body.length>200?p.body.slice(0,200)+'…':p.body}</div>
                  <div className="hb"><span className="hl">SHA-256</span><span className="hv">{p.hash}</span><button className="cb" onClick={()=>{navigator.clipboard.writeText(p.hash)}}>Copy</button></div>
                  <div className="bl">Shelby: <a href={`https://explorer.shelby.xyz/shelbynet/account/${process.env.NEXT_PUBLIC_SHELBY_BUCKET}`} target="_blank" rel="noreferrer">View blobs →</a></div>
                </div>
              ))
            }
          </div>
        )}
        <footer><div className="ftext">EVA — Educational Verified Authorship</div><div className="fshelby">Built on <span>Shelby Protocol</span> × Aptos</div></footer>
      </div>
      <div className={`toast ${toast?'show':''}`}>{toast}</div>
    </>
  )
                               }
export default function Page() {
  return <h1>TEST EVA ROUTE OK</h1>
}
