// ═══════════════════════════════════════════════════════
// FinMatrix Web — Sign-in validation, by portal
// ═══════════════════════════════════════════════════════
// Pulled out of LoginPage so the rule can be tested without rendering a form.
// The two portals take different identifiers — an owner has an email, a staff
// account has a username and no inbox at all — and the field that carries them
// is the same one either way, because /auth/signin takes a single `identifier`
// and decides the role itself.
//
// THE RULE THAT MATTERS: validate narrowly for the owner, permissively for
// everyone else. Client-side validation here can only ever NARROW what the server
// already accepts, so a wrong guess does not protect anyone — it locks someone
// out. Hence:
//
//   role 'admin'  → must look like an email
//   role 'staff'  → any non-empty string
//   role unknown / absent → any non-empty string
//
// The last line is the important one. A bare /login, or a tampered stored
// preference, falls through to the permissive rule. Fail open on validation; the
// server is the thing that fails closed.

import { z } from 'zod';

import type { PortalRole } from '@/utils/storage';

const password = z.string().min(1, 'Enter your password.');

/**
 * Build the schema for a portal.
 *
 * `.trim().pipe(z.email())` rather than a bare `z.email()`: the trim has to run
 * BEFORE the shape check, or a pasted address with a trailing space is rejected
 * for not being an email — which is true of the raw string and useless to say.
 */
export const makeLoginSchema = (role: PortalRole | null | undefined) =>
  z.object({
    identifier:
      role === 'admin'
        ? z
            .string()
            .trim()
            .pipe(z.email('Enter the email address for your account.'))
        : z.string().trim().min(1, 'Enter your username.'),
    password,
  });

export type LoginFormValues = { identifier: string; password: string };
