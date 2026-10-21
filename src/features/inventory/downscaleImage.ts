// Shrinks a large photo in the browser before it is uploaded.
//
// The server resizes every item photo to 1600 px anyway, so sending a 9 MB
// camera original buys nothing — and on a slow connection it can outlast the
// host's 30-second request limit. Anything over 1.5 MB is redrawn with its
// long edge at most 2048 px as a JPEG; smaller files go up untouched.
//
// EXIF orientation is applied while decoding ("from-image"), because the
// redrawn JPEG carries no EXIF for the server to straighten it by.

export const DOWNSCALE_ABOVE_BYTES = 1.5 * 1024 * 1024;
export const MAX_EDGE = 2048;
const QUALITY = 0.85;
const RESIZABLE = /^image\/(jpeg|png|webp)$/;

/** Width and height to draw at: the long edge capped, the shape kept. */
export const scaledSize = (
  width: number,
  height: number,
  max = MAX_EDGE,
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const k = max / longest;
  return { width: Math.round(width * k), height: Math.round(height * k) };
};

export const shouldDownscale = (file: { size: number; type: string }): boolean =>
  file.size > DOWNSCALE_ABOVE_BYTES && RESIZABLE.test(file.type);

/**
 * The file to upload: a smaller JPEG when that helps, otherwise the original.
 * Never throws — a browser that cannot decode the image sends it as it is and
 * lets the server decide.
 */
export async function downscaleImage(file: File): Promise<File> {
  if (!shouldDownscale(file) || typeof createImageBitmap !== 'function') return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no transparency: a PNG cut-out goes on white, as the server does.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
