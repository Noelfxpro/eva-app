import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.SHELBY_ENDPOINT,
  region: 'shelbyland',
  credentials: {
    accessKeyId: process.env.SHELBY_ACCESS_KEY || 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: process.env.SHELBY_SECRET_KEY || 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
  forcePathStyle: true,
})

export async function GET() {
  try {
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.SHELBY_BUCKET,
      Prefix: 'eva-posts/',
    }))
    const posts = []
    for (const obj of (list.Contents || [])) {
      if (!obj.Key) continue
      try {
        const data = await s3.send(new GetObjectCommand({ Bucket: process.env.SHELBY_BUCKET, Key: obj.Key }))
        const body = await data.Body?.transformToString()
        if (body) posts.push(JSON.parse(body))
      } catch {}
    }
    posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return NextResponse.json({ posts })
  } catch (err: unknown) {
    return NextResponse.json({ posts: [], error: err instanceof Error ? err.message : 'Unknown' })
  }
}
