/**
 * Re-encode a photograph in the browser before it is uploaded.
 *
 * This runs on the guest's phone, not the server, and it is doing four
 * jobs at once:
 *
 * 1. **Format.** iPhones hand over HEIC, which nothing else can display.
 *    Decoding to a canvas and re-encoding gives JPEG on every device, so
 *    the bucket only ever holds one format and the gallery always works.
 * 2. **Size.** A modern phone photograph is 4-8MB. A hundred guests on
 *    marquee wifi uploading those is the difference between a feature
 *    that works on the night and one that does not.
 * 3. **Orientation.** `imageOrientation: "from-image"` bakes the EXIF
 *    rotation into the pixels, so a portrait photo is not served on its
 *    side once the metadata is gone.
 * 4. **Location.** Re-encoding drops EXIF entirely, which takes the GPS
 *    tag with it. Guests should not publish their home coordinates to a
 *    shared album because they photographed the bouquet before leaving.
 */

export type PreparedImage = {
  /** The one that goes on the wall and gets kept. */
  full: Blob;
  /** The one the album's grid loads, ~20x smaller. */
  thumb: Blob;
  /** Dimensions of the full copy, so the gallery can reserve its box. */
  width: number;
  height: number;
};

/** Long edge of the full copy. Enough for a projector and a decent print. */
export const MAX_EDGE = 2560;

/**
 * Long edge of the thumbnail. The album is at most four across on a
 * desktop, so 640 covers a retina tile with room to spare - and fifty of
 * these is a couple of megabytes rather than twenty.
 */
export const THUMB_EDGE = 640;

const QUALITY = 0.85;
const THUMB_QUALITY = 0.78;

export class ImagePrepError extends Error {}

export async function prepareImage(
  file: File,
  maxEdge: number = MAX_EDGE,
): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new ImagePrepError(`${file.name} is not an image`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Almost always HEIC on a browser with no decoder for it - Android
    // Chrome, mostly. Nothing can be done client-side, so say what to do.
    throw new ImagePrepError(
      `We could not read ${file.name}. Try saving it as a JPEG first.`,
    );
  }

  try {
    const fit = (edge: number) => {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      return {
        width: Math.max(1, Math.round(bitmap.width * scale)),
        height: Math.max(1, Math.round(bitmap.height * scale)),
      };
    };

    const large = fit(maxEdge);
    const small = fit(THUMB_EDGE);

    // Both are drawn from the one decoded bitmap; decoding twice is the
    // expensive part on a phone, and scaling twice is nearly free.
    const full = await drawToJpeg(bitmap, large.width, large.height, QUALITY);
    const thumb = await drawToJpeg(
      bitmap,
      small.width,
      small.height,
      THUMB_QUALITY,
    );

    return { full, thumb, width: large.width, height: large.height };
  } finally {
    // Bitmaps hold their decoded pixels until closed. Uploading twenty
    // photographs without this is how a phone browser runs out of memory.
    bitmap.close();
  }
}

async function drawToJpeg(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new ImagePrepError("This browser cannot resize images");
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImagePrepError("This browser cannot resize images");
  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new ImagePrepError("This browser cannot resize images")),
      "image/jpeg",
      quality,
    );
  });
}
