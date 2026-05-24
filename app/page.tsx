app/page.tsx'use client'
import { useState, useEffect, useCallback } from 'react'

interface Post {
  author: string
  title: string
  body: string
  hash: string
  signature?: string
  walletAddress?: string
  date: string
  blobName?: string
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
