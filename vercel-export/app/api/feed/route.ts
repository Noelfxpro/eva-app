import { NextResponse } from 'next/server'
import { getAllPosts } from '../../lib/s3'

export async function GET() {
  try {
    const posts = await getAllPosts()
    return NextResponse.json({ posts })
  } catch (err: unknown) {
    return NextResponse.json({
      posts: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}
