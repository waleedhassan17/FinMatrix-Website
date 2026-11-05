import { useQuery } from '@tanstack/react-query';
import { useAppSelector } from '@/store/store';
import { selectFeatures } from '@/store/authSlice';
import { getContactHealth, getMessageTimeline, getMessagingSettings } from '@/networks/messaging/messagingNetwork';
import { isInFlight, type ContactHealthRow, type EventRule, type MessageEvent, type MessagingSettings } from '@/models/messaging';

const POLL_MS = 5_000;

/** Query keys: everything Connect lives under ['messaging', …]. */
export const messagingKeys = {
  all: ['messaging'] as const,
  settings: ['messaging', 'settings'] as const,
  timeline: (docType: string, docId: string) => ['messaging', 'timeline', docType, docId] as const,
  stats: (from?: string, to?: string) => ['messaging', 'stats', from ?? '', to ?? ''] as const,
  contactHealth: ['messaging', 'contact-health'] as const,
  contact: (partyType: string, partyId: string) => ['messaging', 'contact', partyType, partyId] as const,
};

/**
 * FinMatrix Connect for this session.
 *   featureOn — the plan has it. STRICT: `useFeature` treats an absent key as
 *               on, which would offer Connect against a server without it.
 *   enabled   — featureOn AND the owner switched it on: show Connect UI.
 */
export function useConnect(): {
  featureOn: boolean;
  enabled: boolean;
  settings: MessagingSettings | null;
  isLoading: boolean;
  ruleFor: (event: MessageEvent) => EventRule;
} {
  const features = useAppSelector(selectFeatures);
  const featureOn = features?.whatsappConnect === true;
  const q = useQuery({
    queryKey: messagingKeys.settings,
    queryFn: getMessagingSettings,
    enabled: featureOn,
    staleTime: 60_000,
    retry: false,
  });
  const settings = featureOn ? (q.data ?? null) : null;
  return {
    featureOn,
    enabled: featureOn && settings?.enabled === true,
    settings,
    isLoading: featureOn && q.isLoading,
    ruleFor: (event) => settings?.eventRules?.[event] ?? 'off',
  };
}

/** One customer's or vendor's WhatsApp status, when Connect is on. */
export function useContactWhatsapp(
  partyType: 'customer' | 'vendor',
  partyId: string | null | undefined,
  active: boolean,
): ContactHealthRow | null {
  const q = useQuery({
    queryKey: messagingKeys.contact(partyType, partyId ?? ''),
    queryFn: () => getContactHealth({ partyType, partyId: partyId as string }),
    enabled: active && !!partyId,
    staleTime: 30_000,
  });
  if (!active || !partyId) return null;
  return q.data?.contacts.find((c) => c.id === partyId) ?? null;
}

/** The newest message for a document — for "Remittance sent to …" summaries. */
export function useTimeline(docType: string, docId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: messagingKeys.timeline(docType, docId ?? ''),
    queryFn: () => getMessageTimeline(docType, docId as string),
    enabled: enabled && !!docId,
    // Poll only while something is still on its way (queued, sending, sent).
    refetchInterval: (q) => (q.state.data?.some((m) => isInFlight(m.status)) ? POLL_MS : false),
  });
}
