import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'

export interface Post {
  author: string
  title: string
  body: string
  hash: string
  /** Ed25519 signature hex returned by Petra signMessage */
  signature: string | null
  /** Ed25519 public key hex from window.aptos.account() */
  publicKey: string | null
  /** The exact fullMessage string that was signed (for client-side verification) */
  signedMessage: string | null
  walletAddress: string | null
  /** Aptos transaction hash for the on-chain anchor */
  aptosHash: string | null
  /** Aptos network: devnet | testnet | mainnet */
  aptosNetwork: string | null
  date: string
}

// ── In-memory fallback ────────────────────────────────────────────────────────
export const memoryStore: Post[] = []

export function shelbyConfigured(): boolean {
  return !!(process.env.SHELBY_ENDPOINT && process.env.SHELBY_BUCKET)
}

export function makeS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.SHELBY_ENDPOINT,
    region: 'shelbyland',
    credentials: {
      accessKeyId: process.env.SHELBY_ACCESS_KEY || 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey:
        process.env.SHELBY_SECRET_KEY || 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    },
    forcePathStyle: true,
  })
}

export async function getAllPosts(): Promise<Post[]> {
  if (!shelbyConfigured()) {
    return [...memoryStore].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )
  }
  const s3 = makeS3Client()
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: process.env.SHELBY_BUCKET, Prefix: 'eva-posts/' })
  )
  const posts: Post[] = []
  for (const obj of list.Contents ?? []) {
    if (!obj.Key) continue
    try {
      const data = await s3.send(
        new GetObjectCommand({ Bucket: process.env.SHELBY_BUCKET, Key: obj.Key })
      )
      const body = await data.Body?.transformToString()
      if (body) posts.push(JSON.parse(body) as Post)
    } catch {
      // skip malformed blobs
    }
  }
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export async function savePost(post: Post): Promise<string> {
  const blobName = `eva-posts/${post.hash.replace('sha256:', '').slice(0, 16)}-${Date.now()}.json`
  if (!shelbyConfigured()) {
    memoryStore.push(post)
    return blobName
  }
  const s3 = makeS3Client()
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.SHELBY_BUCKET,
      Key: blobName,
      Body: JSON.stringify(post, null, 2),
      ContentType: 'application/json',
    })
  )
  return blobName
}
