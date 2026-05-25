import { NextRequest, NextResponse } from 'next/server'
import { savePost, type Post } from '../../lib/s3'

export async function POST(req: NextRequest) {
  try {
    const {
      author, title, body, hash,
      signature, publicKey, signedMessage, walletAddress,
      aptosHash, aptosNetwork,
    } = await req.json()

    if (!author || !title || !body || !hash) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const post: Post = {
      author,
      title,
      body,
      hash,
      signature: signature ?? null,
      publicKey: publicKey ?? null,
      signedMessage: signedMessage ?? null,
      walletAddress: walletAddress ?? null,
      aptosHash: aptosHash ?? null,
      aptosNetwork: aptosNetwork ?? null,
      date: new Date().toISOString(),
    }

    const blobName = await savePost(post)
    return NextResponse.json({ success: true, blobName, post })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
