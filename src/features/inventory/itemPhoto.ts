// What an item photo may be, checked in the browser before anything uploads —
// the server checks the same again, and decides by the file's bytes.

/** A photo change waiting for the item form's Save. */
export type PhotoChange = { kind: 'keep' } | { kind: 'set'; file: File } | { kind: 'remove' };

export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Why a picked file cannot be the photo, or null when it can. */
export const photoFileError = (file: { type: string; size: number }): string | null => {
  if (!PHOTO_ACCEPT.split(',').includes(file.type)) return 'Choose a JPG, PNG or WEBP photo.';
  if (file.size > PHOTO_MAX_BYTES) return 'That photo is larger than 10 MB.';
  return null;
};
