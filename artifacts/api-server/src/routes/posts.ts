import { Router } from "express";
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

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

router.get("/feed", async (req, res) => {
  try {
    const s3 = makeS3Client();
    const list = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.SHELBY_BUCKET,
      Prefix: "eva-posts/",
    }));
    const posts: unknown[] = [];
    for (const obj of (list.Contents || [])) {
      if (!obj.Key) continue;
      try {
        const data = await s3.send(new GetObjectCommand({ Bucket: process.env.SHELBY_BUCKET, Key: obj.Key }));
        const body = await data.Body?.transformToString();
        if (body) posts.push(JSON.parse(body));
      } catch {
      }
    }
    (posts as Array<{ date: string }>).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json({ posts });
  } catch (err: unknown) {
    res.json({ posts: [], error: err instanceof Error ? err.message : "Unknown" });
  }
});

router.post("/publish", async (req, res) => {
  try {
    const { author, title, body, hash, signature, walletAddress } = req.body;
    if (!author || !title || !body || !hash) {
      res.status(400).json({ error: "Missing fields" });
      return;
    }
    const s3 = makeS3Client();
    const post = {
      author,
      title,
      body,
      hash,
      signature: signature || null,
      walletAddress: walletAddress || null,
      date: new Date().toISOString(),
    };
    const blobName = `eva-posts/${hash.replace("sha256:", "").slice(0, 16)}-${Date.now()}.json`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.SHELBY_BUCKET,
      Key: blobName,
      Body: JSON.stringify(post, null, 2),
      ContentType: "application/json",
    }));
    res.json({ success: true, blobName, post });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
});

export default router;
