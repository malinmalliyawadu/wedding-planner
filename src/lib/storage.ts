import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage for guest photographs.
 *
 * Until this milestone the database was the entire backup surface - the
 * container held no state and a `pg_dump` was the whole of it. Photographs
 * break that, so they go somewhere explicitly backed up rather than onto
 * the container's disk where a redeploy would take them.
 *
 * Browsers upload **straight to the bucket** with a presigned PUT, not
 * through the app. On the night a hundred guests upload at once, and a
 * small VPS proxying every one of those would be the bottleneck. The
 * signature is what enforces the rules: the object's type and its exact
 * byte count are signed into the URL, so the bucket itself refuses a
 * request that sends anything else, and a client that lies about either
 * is turned away by storage rather than trusted by us.
 *
 * A PUT rather than the S3 POST-with-policy form, because Cloudflare R2
 * does not implement the latter at all (501) and every other provider
 * implements presigned PUT. The one thing the policy form could do that
 * a signed PUT cannot is accept a *range* of sizes, which is why a ticket
 * is minted for a known size rather than a cap.
 *
 * Nothing here reads the environment at module scope. Like `src/db`, this
 * is evaluated during `next build`, which has no credentials.
 */

/** Re-encoded client-side to JPEG before upload, so this is the only type. */
export const UPLOAD_CONTENT_TYPE = "image/jpeg";

/** Generous for a downscaled 2560px JPEG; mean enough to stop a video. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** How long a guest has to complete an upload once they have a ticket. */
export const TICKET_TTL_SECONDS = 300;

export type UploadTicket = {
  /** PUT the bytes here. */
  url: string;
  /**
   * Send exactly these headers and nothing that contradicts them. The
   * browser adds `Content-Length` itself from the body, which is why it
   * is signed but not listed.
   */
  headers: Record<string, string>;
  /** The key the object will land on; hand it back when registering. */
  key: string;
  /** The one size the signature will accept. */
  byteSize: number;
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
    // R2 reads `us-east-1` as its own `auto`, so this default works there
    // too; MinIO, used locally, wants this exact value.
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
        // Recent SDKs attach a CRC32 checksum to every request and ask
        // for one back. R2 answers "not implemented" to the header, and
        // the question is moot for us anyway: an upload lands or it does
        // not, and `describeObject` asks the bucket which. `WHEN_REQUIRED`
        // is the pre-2025 behaviour every S3-compatible service expects.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
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

/** Whether a ticket may be minted for a body of this many bytes. */
export function isAllowedUploadSize(byteSize: number): boolean {
  return Number.isInteger(byteSize) && byteSize >= 1 && byteSize <= MAX_UPLOAD_BYTES;
}

/**
 * Mint a ticket for one object of exactly `byteSize` bytes.
 *
 * `Content-Type` and `Content-Length` are added to the signed headers
 * explicitly. The S3 presigner leaves `Content-Type` *out* of the
 * signature by default - the common case is a URL that any client can
 * use with any type - and that default would let a signed ticket for a
 * JPEG carry an HTML file into the bucket. Signing both is what makes
 * the size cap and the type rule the bucket's to enforce, as the POST
 * policy used to.
 */
export async function createUploadTicket(byteSize: number): Promise<UploadTicket> {
  if (!isAllowedUploadSize(byteSize)) {
    throw new Error(`Refusing to sign an upload of ${byteSize} bytes`);
  }
  const { client, config } = getClient();
  const key = newObjectKey();

  const url = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ContentType: UPLOAD_CONTENT_TYPE,
      ContentLength: byteSize,
    }),
    {
      expiresIn: TICKET_TTL_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    },
  );

  return {
    url,
    headers: { "Content-Type": UPLOAD_CONTENT_TYPE },
    key,
    byteSize,
  };
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
 * the signature actually allowed.
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
