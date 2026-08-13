import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";

/**
 * Object storage for guest photographs.
 *
 * Until this milestone the database was the entire backup surface - the
 * container held no state and a `pg_dump` was the whole of it. Photographs
 * break that, so they go somewhere explicitly backed up rather than onto
 * the container's disk where a redeploy would take them.
 *
 * Browsers upload **straight to the bucket** with a presigned POST, not
 * through the app. On the night a hundred guests upload at once, and a
 * small VPS proxying every one of those would be the bottleneck. The
 * policy in the ticket is what enforces the rules: the bucket itself
 * rejects anything over the size limit or of the wrong type, so a client
 * that lies about either is refused by S3 rather than trusted by us.
 *
 * Nothing here reads the environment at module scope. Like `src/db`, this
 * is evaluated during `next build`, which has no credentials.
 */

/** Re-encoded client-side to JPEG before upload, so this is the only type. */
export const UPLOAD_CONTENT_TYPE = "image/jpeg";

/** Generous for a downscaled 2560px JPEG; mean enough to stop a video. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** How long a guest has to complete an upload once they have a ticket. */
const TICKET_TTL_SECONDS = 300;

export type UploadTicket = {
  /** POST the multipart form here. */
  url: string;
  /** Every field must be sent, in order, before the file part. */
  fields: Record<string, string>;
  /** The key the object will land on; hand it back when registering. */
  key: string;
  maxBytes: number;
};

type StorageConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

function readConfig(): StorageConfig | null {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    bucket,
    // Non-AWS S3 services ignore the region but the SDK insists on one.
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId,
    secretAccessKey,
    // Most self-hosted and non-AWS endpoints need path style; the flag
    // exists because getting it wrong produces a DNS error, not a hint.
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

/**
 * Whether photographs can work at all. The upload screen asks this so an
 * unconfigured deploy explains itself instead of throwing at a guest.
 */
export function isStorageConfigured(): boolean {
  return readConfig() !== null;
}

let cached: { client: S3Client; config: StorageConfig } | undefined;

function getClient(): { client: S3Client; config: StorageConfig } {
  const config = readConfig();
  if (!config) {
    throw new Error(
      "Photo storage is not configured: set S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
    );
  }
  if (!cached) {
    cached = {
      config,
      client: new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      }),
    };
  }
  return cached;
}

/**
 * Keys are random, not derived from the photo's id or the uploader's
 * name. If the bucket is ever made readable by mistake, an unguessable
 * key is the difference between one leaked object and a walkable index.
 */
function newObjectKey(): string {
  return `photos/${crypto.randomUUID()}.jpg`;
}

export async function createUploadTicket(): Promise<UploadTicket> {
  const { client, config } = getClient();
  const key = newObjectKey();

  const { url, fields } = await createPresignedPost(client, {
    Bucket: config.bucket,
    Key: key,
    Expires: TICKET_TTL_SECONDS,
    Conditions: [
      ["content-length-range", 1, MAX_UPLOAD_BYTES],
      ["eq", "$Content-Type", UPLOAD_CONTENT_TYPE],
    ],
    Fields: { "Content-Type": UPLOAD_CONTENT_TYPE },
  });

  return { url, fields, key, maxBytes: MAX_UPLOAD_BYTES };
}

/** Keys we issue, and the only shape `describeObject` will look up. */
const KEY_PATTERN =
  /^photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;

export function isIssuedKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * What the bucket says about an object, used to index an upload.
 *
 * The point is that the *bucket* is asked, not the browser. A client
 * reporting its own file's size and type is a client that can claim a
 * 40MB video is a 200KB photograph; asking S3 after the fact means the
 * row can only ever describe something that really landed, at the size
 * the presigned policy actually allowed.
 */
export async function describeObject(
  key: string,
): Promise<{ contentType: string; byteSize: number } | null> {
  if (!isIssuedKey(key)) return null;
  const { client, config } = getClient();
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (head.ContentLength === undefined || head.ContentLength <= 0) return null;
    return {
      contentType: head.ContentType ?? UPLOAD_CONTENT_TYPE,
      byteSize: head.ContentLength,
    };
  } catch {
    // No object under that key: the upload failed, or never happened.
    return null;
  }
}

/**
 * Read an object back for the route that serves it. The bucket stays
 * private: guests never hold a URL into it, only a path on this app,
 * so revoking a photograph is a database update and not a race against
 * a signed URL that is already in someone's camera roll.
 */
export async function getObject(key: string): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
  contentLength?: number;
} | null> {
  const { client, config } = getClient();
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!result.Body) return null;
    return {
      body: result.Body.transformToWebStream(),
      contentType: result.ContentType ?? UPLOAD_CONTENT_TYPE,
      contentLength: result.ContentLength,
    };
  } catch {
    // A key in the database with no object behind it is a 404 to the
    // caller, not a 500: the likeliest cause is a bucket lifecycle rule
    // or a restore that has not finished.
    return null;
  }
}
