// ═══════════════════════════════════════════════════════
// FinMatrix Web — Customer and vendor IDs
// ═══════════════════════════════════════════════════════
// The short ID people search, print and quote — C-0001, V-0001 — like
// Peachtree's Customer ID and Vendor ID. The server assigns the next one when
// the field is left empty, keeps a typed one upper-cased, and refuses one
// another party already has (common/utils/party-code.util.ts on the API).

/** Letters, digits and . _ / - — starting with a letter or digit, at most 20. */
export const PARTY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{0,19}$/;
export const PARTY_CODE_MAX = 20;

/** What the server will store: trimmed and upper-cased. */
export const normalizePartyCode = (raw: string): string => raw.trim().toUpperCase();

/** A form's message for a typed ID the server would refuse, or null when it is fine. */
export const partyCodeProblem = (raw: string, label: 'Customer' | 'Vendor'): string | null => {
  const code = normalizePartyCode(raw);
  if (!code) return null;
  if (code.length > PARTY_CODE_MAX) return `${label} ID must be ${PARTY_CODE_MAX} characters or fewer`;
  if (!PARTY_CODE_PATTERN.test(code)) {
    return `${label} ID can use letters, numbers and . _ / - (no spaces)`;
  }
  return null;
};

/**
 * How a party reads wherever it is listed or picked: `C-0007 · Ali Traders`.
 * Pickers filter on their label, so this is also what makes every picker
 * searchable by ID.
 */
export const partyLabel = (code: string | null | undefined, name: string): string =>
  code ? `${code} · ${name}` : name;
