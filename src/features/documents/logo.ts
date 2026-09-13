/**
 * A company logo safe to show in an <img>: an https URL or an image data URI.
 * Anything else (a relative path, a script URL) falls back to the initials tile.
 */
export const embeddableLogoForScreen = (logo: string | null | undefined): string | null => {
  if (!logo) return null;
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(logo)) return logo;
  if (/^https:\/\//i.test(logo)) return logo;
  return null;
};
