import { describe, expect, it } from 'vitest';

import { readCredentials } from '@/networks/delivery/personnelNetwork';

/**
 * The reset-password response is the ONLY time the office sees a rider's new
 * password — it is hashed on the server and never recoverable again. So the
 * rule is: if a password came back, keep it.
 *
 * This used to require a username too. A rider with none came back as
 * `{ username: '', password: 'Xvnnys92Ruy' }`, `''` is falsy, and the whole
 * response was discarded — so "Reset password" threw away the password the
 * server had just issued and the dialog claimed nothing was returned. Pressing
 * it again looped forever, and an admin could not rescue such a rider at all.
 */
describe('readCredentials', () => {
  it('keeps a password that arrived with no username', () => {
    // The exact shape that used to be dropped.
    expect(
      readCredentials({ credentials: { username: '', password: 'Xvnnys92Ruy' } }),
    ).toEqual({ username: '', password: 'Xvnnys92Ruy' });
  });

  it('keeps both when both are present', () => {
    expect(
      readCredentials({ credentials: { username: 'fm.abbas', password: 'Pw123456' } }),
    ).toEqual({ username: 'fm.abbas', password: 'Pw123456' });
  });

  it('returns null only when there is no password to show', () => {
    expect(readCredentials({ credentials: { username: 'fm.abbas' } })).toBeNull();
    expect(readCredentials({ credentials: { username: 'fm.abbas', password: null } })).toBeNull();
    expect(readCredentials({})).toBeNull();
    expect(readCredentials(null)).toBeNull();
  });
});
