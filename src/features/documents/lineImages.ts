// Item photos for a document's lines, embedded as data URIs.
//
// Quotations, invoices and sales orders show each line's item photo, the way a
// furniture or fit-out business sends a quote. The photos are fetched just
// before the PDF is drawn and embedded, so the file stands on its own when it
// is forwarded — the signed links behind them expire after a week.
//
// A photo that fails — none on file, a slow connection, a refused link —
// leaves its line without one. A document is never held up for a picture.

import type { DocumentModel } from '@/features/documents/documentModel';
import { getItemImageUrls } from '@/networks/inventory/inventoryNetwork';

const CONCURRENCY = 6;
const PER_PHOTO_MS = 8_000;

/** Only an image the PDF renderer can embed may become a line's photo. */
export const isEmbeddablePhoto = (v: unknown): v is string =>
  typeof v === 'string' && /^data:image\/(jpeg|png);base64,/i.test(v);

/** Base64 in chunks: one String.fromCharCode over a 40 KB photo overflows the stack. */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function fetchPhoto(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_PHOTO_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(jpeg|png)$/.test(blob.type)) return null;
    const dataUrl = await blobToDataUrl(blob);
    return isEmbeddablePhoto(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The document with `photo` set on every line whose item has one. */
export async function attachLinePhotos(doc: DocumentModel): Promise<DocumentModel> {
  const ids = [...new Set(doc.lines.map((l) => l.itemId).filter((id): id is string => !!id))];
  if (ids.length === 0) return doc;

  let urls: Record<string, { thumbnailUrl: string }>;
  try {
    urls = await getItemImageUrls(ids);
  } catch {
    return doc;
  }

  const photos: Record<string, string> = {};
  const queue = Object.entries(urls).filter(([, u]) => !!u?.thumbnailUrl);
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [itemId, { thumbnailUrl }] = next;
      const photo = await fetchPhoto(thumbnailUrl);
      if (photo) photos[itemId] = photo;
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return {
    ...doc,
    lines: doc.lines.map((l) => (l.itemId && photos[l.itemId] ? { ...l, photo: photos[l.itemId] } : l)),
  };
}
