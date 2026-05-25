import { NextRequest, NextResponse } from 'next/server'
import { getAllPosts } from '../../lib/s3'

// ── Aptos node URLs per network ───────────────────────────────────────────────
const APTOS_NODE: Record<string, string> = {
  devnet: 'https://fullnode.devnet.aptoslabs.com/v1',
  testnet: 'https://api.testnet.aptoslabs.com/v1',
  mainnet: 'https://api.mainnet.aptoslabs.com/v1',
}

async function verifyOnChain(
  aptosHash: string,
  aptosNetwork: string,
  hash: string
): Promise<boolean> {
  try {
    const baseUrl = APTOS_NODE[aptosNetwork] ?? APTOS_NODE.testnet
    const res = await fetch(`${baseUrl}/transactions/by_hash/${aptosHash}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return false
    const txn = await res.json() as Record<string, unknown>
    // Script payload: arguments[0] is the hash as hex-encoded vector<u8>
    const args = (txn?.payload as Record<string, unknown>)?.arguments
    if (!Array.isArray(args) || args.length === 0) return false
    const argHex = args[0] as string
    const h = argHex.startsWith('0x') ? argHex.slice(2) : argHex
    const decoded = Buffer.from(h, 'hex').toString('utf8')
    return decoded === hash.trim()
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const { hash } = await req.json()
    if (!hash) {
      return NextResponse.json({ error: 'Missing hash' }, { status: 400 })
    }

    const posts = await getAllPosts()
    const match = posts.find((p) => p.hash === hash.trim()) ?? null

    let onChain: boolean | null = null
    if (match?.aptosHash && match.aptosNetwork) {
      onChain = await verifyOnChain(match.aptosHash, match.aptosNetwork, match.hash)
    }

    return NextResponse.json({ found: match !== null, post: match, onChain })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
