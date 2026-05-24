import { Router } from "express";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

interface Post {
  author: string;
  title: string;
  body: string;
  hash: string;
  signature: string | null;
  publicKey: string | null;
  signedMessage: string | null;
  walletAddress: string | null;
  date: string;
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const memoryStore: Post[] = [];

function shelbyConfigured(): boolean {
  return !!(process.env.SHELBY_ENDPOINT && process.env.SHELBY_BUCKET);
}

function makeS3Client() {
  return new S3Client({
    endpoint: process.env.SHELBY_ENDPOINT,
    region: "shelbyland",
    credentials: {
      accessKeyId: process.env.SHELBY_ACCESS_KEY || "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: process.env.SHELBY_SECRET_KEY || "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    },
    forcePathStyle: true,
  });
}

async function getAllPosts(): Promise<Post[]> {
  if (!shelbyConfigured()) {
    return [...memoryStore].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }
  const s3 = makeS3Client();
  const list = await s3.send(
    new ListObjectsV2Command({ Bucket: process.env.SHELBY_BUCKET, Prefix: "eva-posts/" })
  );
  const posts: Post[] = [];
  for (const obj of list.Contents || []) {
    if (!obj.Key) continue;
    try {
      const data = await s3.send(
        new GetObjectCommand({ Bucket: process.env.SHELBY_BUCKET, Key: obj.Key })
      );
      const body = await data.Body?.transformToString();
      if (body) posts.push(JSON.parse(body) as Post);
    } catch {
      // skip malformed blobs
    }
  }
  return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

async function savePost(post: Post): Promise<string> {
  const blobName = `eva-posts/${post.hash.replace("sha256:", "").slice(0, 16)}-${Date.now()}.json`;
  if (!shelbyConfigured()) {
    memoryStore.push(post);
    return blobName;
  }
  const s3 = makeS3Client();
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.SHELBY_BUCKET,
      Key: blobName,
      Body: JSON.stringify(post, null, 2),
      ContentType: "application/json",
    })
  );
  return blobName;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/feed", async (req, res) => {
  try {
    const posts = await getAllPosts();
    res.json({ posts });
  } catch (err: unknown) {
    res.json({ posts: [], error: err instanceof Error ? err.message : "Unknown" });
  }
});

router.post("/publish", async (req, res) => {
  try {
    const { author, title, body, hash, signature, publicKey, signedMessage, walletAddress } = req.body;
    if (!author || !title || !body || !hash) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }
    const post: Post = {
      author,
      title,
      body,
      hash,
      signature: signature || null,
      publicKey: publicKey || null,
      signedMessage: signedMessage || null,
      walletAddress: walletAddress || null,
      date: new Date().toISOString(),
    };
    const blobName = await savePost(post);
    res.json({ success: true, blobName, post });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { hash } = req.body;
    if (!hash) {
      res.status(400).json({ error: "Missing hash" });
      return;
    }
    const posts = await getAllPosts();
    const match = posts.find((p) => p.hash === hash.trim()) ?? null;
    res.json({ found: match !== null, post: match });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
