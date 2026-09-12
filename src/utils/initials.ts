/**
 * Up to two initials for an avatar: "Warehouse Admin" → "WA".
 *
 * Shared by the top bar and My account so the same person is drawn with the
 * same letters in both places. Falls back to "?" rather than an empty circle.
 */
export const initialsOf = (name: string | null | undefined): string => {
  const letters = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return letters || '?';
};
