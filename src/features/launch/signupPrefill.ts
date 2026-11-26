// ═══════════════════════════════════════════════════════
// FinMatrix Web — details carried from a demo's "Start your free trial" link
// ═══════════════════════════════════════════════════════
// /register?ref=demo_<id>&name=&email=&business=&phone= pre-fills sign-up;
// the business name and phone wait in sessionStorage for company setup, and
// `ref` goes to the server with the sign-up so the demo is linked.

const KEY = 'fm.signupPrefill';

export interface SignupPrefill {
  ref?: string;
  name?: string;
  email?: string;
  business?: string;
  phone?: string;
}

const clean = (v: string | null, max: number) => {
  const t = (v ?? '').trim();
  return t ? t.slice(0, max) : undefined;
};

/** Read the prefill from a sign-up URL's query string and keep it for later steps. */
export function captureSignupPrefill(search: string): SignupPrefill {
  const q = new URLSearchParams(search);
  const ref = clean(q.get('ref'), 64);
  const p: SignupPrefill = {
    ref: ref && /^demo_[0-9a-f-]{36}$/i.test(ref) ? ref : undefined,
    name: clean(q.get('name'), 80),
    email: clean(q.get('email'), 255),
    business: clean(q.get('business'), 120),
    phone: clean(q.get('phone'), 24),
  };
  if (Object.values(p).some(Boolean)) {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* private mode */
    }
  }
  return p;
}

export function readSignupPrefill(): SignupPrefill {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SignupPrefill) : {};
  } catch {
    return {};
  }
}
