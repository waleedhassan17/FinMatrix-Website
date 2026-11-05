/**
 * A password to hand to someone in person — a rider, a warehouse hand.
 *
 * These accounts have no inbox and no self-service reset, so the office sets
 * the password and passes it on. Random, without the characters people misread
 * aloud (0/O, 1/l/I), and guaranteed an upper, a lower and a digit so it meets
 * the server's policy (PASSWORD_REGEX).
 */
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = UPPER + LOWER + DIGITS;

const randomIndex = (n: number): number => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % n;
};

export const generatePassword = (length = 10): string => {
  const pick = (set: string) => set[randomIndex(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALPHABET));
  // Shuffle, so the guaranteed three are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

export interface PasswordCheck {
  key: 'length' | 'lower' | 'upper' | 'digit';
  label: string;
  met: boolean;
}

/**
 * The server's password rule, one requirement at a time, so a form can tick
 * them off as the person types instead of refusing the whole thing on submit.
 */
export const passwordChecks = (password: string): PasswordCheck[] => [
  { key: 'length', label: 'At least 8 characters', met: password.length >= 8 },
  { key: 'upper', label: 'An uppercase letter', met: /[A-Z]/.test(password) },
  { key: 'lower', label: 'A lowercase letter', met: /[a-z]/.test(password) },
  { key: 'digit', label: 'A number', met: /\d/.test(password) },
];

/** The server's PASSWORD_REGEX plus its 8-character minimum. */
export const meetsPasswordPolicy = (password: string): boolean =>
  passwordChecks(password).every((check) => check.met);

/** `Imran Khan` → `imran.khan`: a username the server's rule accepts, from a name. */
export const suggestUsername = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 64);
