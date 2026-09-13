import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { companyForDocument, type DocCompany } from '@/features/documents/documentModel';
import type { Customer } from '@/models/customer';
import type { Vendor } from '@/models/vendor';
import { getCustomerById } from '@/networks/sales/customerNetwork';
import { getVendorById } from '@/networks/purchases/vendorNetwork';
import { getCompanyProfile } from '@/networks/settings/settingsNetwork';
import { selectCompany, selectCompanyId } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';

/**
 * The letterhead for this company's documents.
 *
 * Shares its cache with the Company profile page, so a logo or address saved
 * there is on the next document straight away. Until it loads — or for a member
 * who cannot read it — the session's company name keeps the sheet branded.
 */
export function useDocumentCompany(): DocCompany {
  const companyId = useAppSelector(selectCompanyId);
  const sessionCompany = useAppSelector(selectCompany);

  const { data } = useQuery({
    queryKey: ['companies', companyId, 'profile'],
    queryFn: () => getCompanyProfile(companyId!),
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return useMemo(() => companyForDocument(data, sessionCompany?.name), [data, sessionCompany?.name]);
}

/** The customer a document is addressed to: address, email, phone, terms. */
export function useDocumentCustomer(customerId: string | null | undefined): Customer | null {
  const { data } = useQuery({
    queryKey: ['customers', customerId, 'document-party'],
    queryFn: () => getCustomerById(customerId!),
    enabled: !!customerId,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data?.customer ?? null;
}

/** The vendor a document is addressed to. */
export function useDocumentVendor(vendorId: string | null | undefined): Vendor | null {
  const { data } = useQuery({
    queryKey: ['vendors', vendorId, 'document-party'],
    queryFn: () => getVendorById(vendorId!),
    enabled: !!vendorId,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data ?? null;
}
