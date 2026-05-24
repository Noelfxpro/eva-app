import { NextRequest, NextResponse } from 'next/server'
import { getAllPosts } from '../../lib/s3'

export async function POST(req: NextRequest) {
  try {
    const { hash } = await req.json()

    if (!hash) {
      return NextResponse.json({ error: 'Missing hash' }, { status: 400 })
    }

    const posts = await getAllPosts()
    const match = posts.find((p) => p.hash === hash.trim()) ?? null

    return NextResponse.json({ found: match !== null, post: match })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
