import { describe, expect, it } from 'vitest';

import { DOWNSCALE_ABOVE_BYTES, MAX_EDGE, scaledSize, shouldDownscale } from '@/features/inventory/downscaleImage';
import { PHOTO_MAX_BYTES, photoFileError } from '@/features/inventory/itemPhoto';

// A camera original is shrunk before upload — the server keeps 1600 px at most
// anyway, and a 9 MB photo on a slow line can outlast the host's 30 s limit.

describe('scaledSize', () => {
  it('caps the long edge and keeps the shape', () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: MAX_EDGE, height: 1536 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1536, height: MAX_EDGE });
  });

  it('never enlarges', () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('shouldDownscale', () => {
  it('shrinks only large JPEG, PNG and WEBP files', () => {
    expect(shouldDownscale({ size: DOWNSCALE_ABOVE_BYTES + 1, type: 'image/jpeg' })).toBe(true);
    expect(shouldDownscale({ size: DOWNSCALE_ABOVE_BYTES, type: 'image/jpeg' })).toBe(false);
    expect(shouldDownscale({ size: DOWNSCALE_ABOVE_BYTES * 4, type: 'image/gif' })).toBe(false);
  });
});

describe('photoFileError', () => {
  it('accepts the three formats the server stores, under 10 MB', () => {
    expect(photoFileError({ type: 'image/png', size: 1000 })).toBeNull();
    expect(photoFileError({ type: 'image/heic', size: 1000 })).toMatch(/JPG, PNG or WEBP/);
    expect(photoFileError({ type: 'image/jpeg', size: PHOTO_MAX_BYTES + 1 })).toMatch(/10 MB/);
  });
});
