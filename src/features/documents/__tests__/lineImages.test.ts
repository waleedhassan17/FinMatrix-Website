import { beforeEach, describe, expect, it, vi } from 'vitest';

// Photos on quotation lines are fetched and embedded just before the PDF is
// drawn. Anything that is not a JPEG/PNG — or that fails — leaves its line
// without a photo; the document is never held up for one.

vi.mock('@/networks/inventory/inventoryNetwork', () => ({ getItemImageUrls: vi.fn() }));

import type { DocumentModel } from '@/features/documents/documentModel';
import { attachLinePhotos, isEmbeddablePhoto } from '@/features/documents/lineImages';
import { getItemImageUrls } from '@/networks/inventory/inventoryNetwork';

const doc = {
  lines: [
    { description: 'Sofa', itemId: 'sofa', quantity: 1, unitPrice: 1, taxRate: 0, amount: 1 },
    { description: 'Lamp', itemId: 'lamp', quantity: 1, unitPrice: 1, taxRate: 0, amount: 1 },
    { description: 'Fitting', quantity: 1, unitPrice: 1, taxRate: 0, amount: 1 },
  ],
} as unknown as DocumentModel;

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('attachLinePhotos', () => {
  it('embeds each item’s photo and skips what is not an image', async () => {
    vi.mocked(getItemImageUrls).mockResolvedValueOnce({
      sofa: { thumbnailUrl: 'https://api/sofa.jpg', imageUrl: '' },
      lamp: { thumbnailUrl: 'https://api/lamp.jpg', imageUrl: '' },
    });
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('sofa')
        ? new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }))
        : new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    );

    const out = await attachLinePhotos(doc);
    expect(getItemImageUrls).toHaveBeenCalledWith(['sofa', 'lamp']);
    expect(out.lines[0].photo).toMatch(/^data:image\/jpeg;base64,/);
    expect(out.lines[1].photo).toBeUndefined();
    expect(out.lines[2].photo).toBeUndefined();
  });

  it('returns the document untouched when the lookup fails or no line has an item', async () => {
    vi.mocked(getItemImageUrls).mockRejectedValueOnce(new Error('403'));
    await expect(attachLinePhotos(doc)).resolves.toBe(doc);

    const noItems = { lines: [{ description: 'Labour', quantity: 1, unitPrice: 1, taxRate: 0, amount: 1 }] } as unknown as DocumentModel;
    await expect(attachLinePhotos(noItems)).resolves.toBe(noItems);
    expect(getItemImageUrls).toHaveBeenCalledTimes(1);
  });
});

describe('isEmbeddablePhoto', () => {
  it('accepts only PNG and JPEG data URIs', () => {
    expect(isEmbeddablePhoto('data:image/png;base64,AAAA')).toBe(true);
    expect(isEmbeddablePhoto('data:image/webp;base64,AAAA')).toBe(false);
    expect(isEmbeddablePhoto('https://api/x.jpg')).toBe(false);
  });
});
