import { beforeEach, describe, expect, it, vi } from 'vitest';

// Photo upload and import ride on postMultipart with exact field names —
// `image` and `file` — because multer answers anything else with "file is
// required". A commit carries its Idempotency-Key so a retry replays instead
// of importing twice, and the batch photo lookup stays inside 200 ids.

vi.mock('@/networks/network/apiHelpers', () => ({
  api: { get: vi.fn(), delete: vi.fn() },
  authedBlob: vi.fn(),
  isPendingApproval: vi.fn(() => false),
  postMultipart: vi.fn(),
  toApiError: vi.fn((e: unknown) => e),
  unwrapEnvelope: (r: unknown) =>
    r && typeof r === 'object' && 'data' in r ? (r as { data: unknown }).data : r,
}));
vi.mock('@/features/pdf/renderPdf', () => ({ downloadBlob: vi.fn() }));

import { downloadBlob } from '@/features/pdf/renderPdf';
import { api, authedBlob, postMultipart } from '@/networks/network/apiHelpers';
import {
  commitImport,
  downloadItemsTemplate,
  getItemImageUrls,
  previewImport,
  uploadItemImage,
} from '@/networks/inventory/inventoryNetwork';

const post = vi.mocked(postMultipart);
const get = vi.mocked(api.get);
const file = new File(['x'], 'items.xlsx');

beforeEach(() => vi.clearAllMocks());

describe('inventory photo and import network', () => {
  it('uploads a photo under "image" and maps the item that comes back', async () => {
    post.mockResolvedValueOnce({ id: 'i1', sku: 'A', thumbnailUrl: 'https://a/t.jpg' });
    const item = await uploadItemImage('i1', new Blob(['p'], { type: 'image/jpeg' }), 'p.jpg');
    const [path, form] = post.mock.calls[0];
    expect(path).toBe('/inventory/items/i1/image');
    expect((form as FormData).get('image')).toBeInstanceOf(Blob);
    expect(item.thumbnailUrl).toBe('https://a/t.jpg');
  });

  it('previews under "file"', async () => {
    post.mockResolvedValueOnce({ summary: {}, rows: [] });
    await previewImport(file);
    const [path, form] = post.mock.calls[0];
    expect(path).toBe('/inventory/import/preview');
    expect(((form as FormData).get('file') as File).name).toBe('items.xlsx');
  });

  it('commits with the Idempotency-Key and the confirmed opening stock, and nothing it was not given', async () => {
    post.mockResolvedValue({ summary: {}, rows: [] });
    await commitImport(file, { openingStockDate: '2026-10-21', confirmOpeningStockValue: '34000.0000' }, 'k1');
    const [path, form, opts] = post.mock.calls[0];
    expect(path).toBe('/inventory/import');
    expect(opts).toEqual({ headers: { 'Idempotency-Key': 'k1' } });
    expect((form as FormData).get('openingStockDate')).toBe('2026-10-21');
    expect((form as FormData).get('confirmOpeningStockValue')).toBe('34000.0000');

    await commitImport(file, {}, 'k2');
    expect((post.mock.calls[1][1] as FormData).get('openingStockDate')).toBeNull();
  });

  it('asks for photo links 200 ids at a time and merges the answers', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `item-${i}`);
    get
      .mockResolvedValueOnce({ data: { success: true, data: { images: { 'item-0': { thumbnailUrl: 't0', imageUrl: 'i0' } } } } })
      .mockResolvedValueOnce({ data: { success: true, data: { images: { 'item-249': { thumbnailUrl: 't249', imageUrl: 'i249' } } } } });
    const out = await getItemImageUrls([...ids, 'item-0', '']);
    expect(get).toHaveBeenCalledTimes(2);
    expect((get.mock.calls[0][1] as { params: { ids: string } }).params.ids.split(',')).toHaveLength(200);
    expect(Object.keys(out)).toEqual(['item-0', 'item-249']);
  });

  it('downloads the export through the session, under a readable name', async () => {
    const blob = new Blob(['xlsx']);
    vi.mocked(authedBlob).mockResolvedValueOnce(blob);
    await expect(downloadItemsTemplate(true)).resolves.toBe('inventory-items.xlsx');
    expect(authedBlob).toHaveBeenCalledWith('/inventory/import/template?prefill=true');
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'inventory-items.xlsx');
  });
});
