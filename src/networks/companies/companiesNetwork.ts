// ═══════════════════════════════════════════════════════
// FinMatrix Web — Company creation
// ═══════════════════════════════════════════════════════
// The two calls that turn a verified owner into a company with a subscription
// pending review.
//
// Order matters and is not interchangeable:
//   POST /companies            → a DRAFT company, and the id every later request
//                                needs in its x-company-id header
//   POST /companies/:id/submit → hands the draft to an administrator for approval
//
// The submit comes AFTER the payment proof, because a company submitted without
// one sits in the approval queue with nothing to approve.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';

export interface CompanyDraft {
  name: string;
  industry?: string;
  companyType?: string;
  legalStructure?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  phone?: string;
  email?: string;
  website?: string;
  taxId?: string;
}

export interface CreatedCompany {
  id: string;
  name: string;
  status: string;
}

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Drop empty strings — the server's @IsOptional rejects '' where absent is fine. */
const prune = (draft: CompanyDraft): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(draft)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
      continue;
    }
    if (typeof value === 'object') {
      const nested: Record<string, string> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (typeof v === 'string' && v.trim()) nested[k] = v.trim();
      }
      if (Object.keys(nested).length > 0) out[key] = nested;
      continue;
    }
    out[key] = value;
  }

  return out;
};

/**
 * Create the company.
 *
 * The caller MUST persist the returned id with setStoredCompanyId before any
 * further authed request: the axios interceptor reads x-company-id from storage
 * and nothing else populates it, so a company created but not stored leaves the
 * next call unscoped.
 */
export const createCompany = async (
  draft: CompanyDraft,
): Promise<CreatedCompany> => {
  try {
    const response = await api.post('/companies', prune(draft));
    const data = asRaw(unwrapEnvelope(response));

    const id = str(data.id) || str(data.companyId);
    if (!id) {
      // Better to say so than to carry on and have every later request 403 for
      // a reason that points somewhere else entirely.
      throw new Error(
        'The company was created but the server returned no id. Please reload and check Settings.',
      );
    }

    return { id, name: str(data.name), status: str(data.status) };
  } catch (error) {
    throw toApiError(error);
  }
};

/** Hand the draft company to an administrator for approval. */
export const submitCompanyForApproval = async (
  companyId: string,
): Promise<{ status: string }> => {
  try {
    const response = await api.post(`/companies/${companyId}/submit`);
    const data = asRaw(unwrapEnvelope(response));
    return { status: str(data.status) || 'pending' };
  } catch (error) {
    throw toApiError(error);
  }
};
