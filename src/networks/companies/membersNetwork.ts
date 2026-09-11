// ═══════════════════════════════════════════════════════
// FinMatrix Web — Company members
// ═══════════════════════════════════════════════════════
// `GET /companies/:companyId/members` is owner-only (the service asserts admin).
// Its one use here is naming the requester on an approval, which only the owner's
// inbox needs — a staff member only ever sees their own requests.

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import { asRaw, str } from '@/serializers/documentLines';

export interface CompanyMember {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  joinedAt: string;
}

export const getCompanyMembers = async (companyId: string): Promise<CompanyMember[]> => {
  try {
    const response = await api.get(`/companies/${companyId}/members`);
    const data = unwrapEnvelope(response.data);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(asRaw(data).data)
        ? (asRaw(data).data as unknown[])
        : [];
    return rows.map((raw) => {
      const r = asRaw(raw);
      return {
        userId: str(r.userId),
        email: str(r.email),
        displayName: str(r.displayName),
        role: str(r.role),
        joinedAt: str(r.joinedAt),
      };
    });
  } catch (e) {
    throw toApiError(e);
  }
};
