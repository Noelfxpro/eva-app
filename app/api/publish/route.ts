import { NextRequest, NextResponse } from 'next/server'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const s3 = new S3Client({
  endpoint: process.env.SHELBY_ENDPOINT,
  region: 'shelbyland',
  credentials: {
    accessKeyId: process.env.SHELBY_ACCESS_KEY || 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: process.env.SHELBY_SECRET_KEY || 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
  forcePathStyle: true,
})

export async function POST(req: NextRequest) {
  try {
    const { author, title, body, hash, signature, walletAddress } = await req.json()
    if (!author || !title || !body || !hash) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const post = { author, title, body, hash, signature: signature || null, walletAddress: walletAddress || null, date: new Date().toISOString() }
    const blobName = `eva-posts/${hash.replace('sha256:', '').slice(0, 16)}-${Date.now()}.json`
    await s3.send(new PutObjectCommand({
      Bucket: process.env.SHELBY_BUCKET,
      Key: blobName,
      Body: JSON.stringify(post, null, 2),
      ContentType: 'application/json',
    }))
    return NextResponse.json({ success: true, blobName, post })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
