import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Send, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Switch } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { SettingsTabs } from '@/features/settings/SettingsTabs';
import { messagingKeys, useConnect } from '@/features/messaging/useConnect';
import {
  confirmContactsConsent,
  getMessagingStats,
  sendTestMessage,
  updateMessagingSettings,
  type MessagingSettingsPatch,
} from '@/networks/messaging/messagingNetwork';
import {
  EVENT_LABELS,
  MESSAGE_EVENTS,
  RULE_LABELS,
  type EventRule,
  type MessageEvent,
  type MessagingSettings,
} from '@/models/messaging';

/** invoice_revised has no trigger while a sent invoice cannot be edited (CONNECT_PROGRESS D4). */
const SHOWN_EVENTS = MESSAGE_EVENTS.filter((e) => e !== 'invoice_revised');
const RULES: EventRule[] = ['auto', 'manual', 'off'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const parseDays = (v: string): number[] | null => {
  const n = v.split(/[\s,]+/).filter(Boolean).map(Number);
  return n.every((x) => Number.isInteger(x) && x >= 0 && x <= 365) ? n : null;
};

/**
 * FinMatrix Connect — owner settings: the master switch, what goes out
 * automatically, language, quiet hours, reminder days, a monthly cap, a test
 * message, the one-time consent confirmation, and this month's usage.
 */
export default function WhatsAppConnectPage() {
  const { featureOn, settings, isLoading } = useConnect();
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: messagingKeys.stats(), queryFn: () => getMessagingStats(), enabled: featureOn });
  const [consentOpen, setConsentOpen] = useState(false);

  const save = useMutation({
    mutationFn: (patch: MessagingSettingsPatch) => updateMessagingSettings(patch),
    onSuccess: (s) => {
      queryClient.setQueryData(messagingKeys.settings, s);
      void queryClient.invalidateQueries({ queryKey: messagingKeys.all });
      toast.success('Saved');
    },
    onError: (e: Error) => toast.error('Not saved', { description: e.message }),
  });
  const test = useMutation({
    mutationFn: sendTestMessage,
    onSuccess: (r) =>
      r.status === 'queued'
        ? toast.success('Test queued', { description: 'It goes to your own WhatsApp in a few seconds.' })
        : toast.info('Not sent', { description: r.skipReason ?? r.status }),
    onError: (e: Error) => toast.error('Could not send the test', { description: e.message }),
  });
  const consent = useMutation({
    mutationFn: confirmContactsConsent,
    onSuccess: (s) => {
      queryClient.setQueryData(messagingKeys.settings, s);
      setConsentOpen(false);
      toast.success('Consent confirmed');
    },
    onError: (e: Error) => toast.error('Not confirmed', { description: e.message }),
  });

  if (!featureOn) {
    return (
      <div className="flex flex-col gap-lg">
        <SettingsTabs />
        <FeatureUnavailable
          icon={MessageCircle}
          title="WhatsApp Connect is not part of this plan"
          body="Invoices, receipts and reminders can still be shared through WhatsApp by hand from every document."
        />
      </div>
    );
  }
  if (!settings) {
    return (
      <div className="flex flex-col gap-lg">
        <SettingsTabs />
        <p className="text-body-sm text-text-secondary">{isLoading ? 'Loading…' : 'Could not load the settings.'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <SettingsTabs />
      <div>
        <h1 className="text-h2 text-text-primary">WhatsApp Connect</h1>
        <p className="text-body-md text-text-secondary">
          {settings.providerMode === 'simulated'
            ? 'Simulated: messages are tracked here but nothing reaches WhatsApp yet.'
            : 'Documents go out from your WhatsApp Business number, with the PDF, and you see when they are read.'}
        </p>
      </div>

      <Card className="flex items-center justify-between gap-md p-lg">
        <div>
          <p className="text-label-lg text-text-primary">Send documents on WhatsApp</p>
          <p className="text-body-sm text-text-secondary">
            Invoices, receipts, purchase orders, remittances and payment reminders go to your contacts from the server.
          </p>
        </div>
        <Switch
          checked={settings.enabled}
          disabled={save.isPending}
          onCheckedChange={(v) => save.mutate({ enabled: v })}
          label={<span className="sr-only">Send documents on WhatsApp</span>}
        />
      </Card>

      <Card className="p-lg">
        <SectionHeader title="What goes out" />
        <ul className="mt-md flex flex-col divide-y divide-border-light">
          {SHOWN_EVENTS.map((e: MessageEvent) => (
            <li key={e} className="flex flex-col gap-xs py-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="text-label-md text-text-primary">{EVENT_LABELS[e]}</span>
              <SegmentedControl
                label={EVENT_LABELS[e]}
                size="sm"
                value={settings.eventRules[e]}
                options={RULES.map((r) => ({ value: r, label: RULE_LABELS[r] }))}
                onChange={(r) => save.mutate({ eventRules: { [e]: r } })}
              />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Language" />
        <div className="mt-md">
          <SegmentedControl
            label="Message language"
            value={settings.defaultLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ur', label: 'اردو (Urdu)' },
            ]}
            onChange={(l) => save.mutate({ defaultLanguage: l })}
          />
        </div>
      </Card>

      <ScheduleCard settings={settings} saving={save.isPending} onSave={(p) => save.mutate(p)} />

      <Card className="flex flex-col gap-sm p-lg">
        <SectionHeader title="Contacts" />
        <p className="text-body-sm text-text-secondary">
          {settings.contactsOptInConfirmedAt
            ? `Confirmed on ${new Date(settings.contactsOptInConfirmedAt).toLocaleDateString()}: your existing contacts agreed to WhatsApp messages.`
            : 'Messages only go to contacts whose consent is recorded. If all your existing contacts agreed, confirm it once here.'}
        </p>
        <div className="flex flex-wrap gap-sm">
          {!settings.contactsOptInConfirmedAt && (
            <Button variant="secondary" onClick={() => setConsentOpen(true)}>
              <UserCheck className="size-4" aria-hidden="true" />
              Confirm consent for existing contacts
            </Button>
          )}
          <Button asChild variant="text">
            <Link to="/contacts/health">Fix contacts</Link>
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-sm p-lg">
        <SectionHeader title="This month" />
        {stats.data ? (
          <p className="text-body-sm text-text-secondary">
            <span className="text-label-lg text-text-primary">
              {stats.data.usage.count} sent{stats.data.usage.cap !== null ? ` of ${stats.data.usage.cap}` : ''}
            </span>{' '}
            · {stats.data.delivered} delivered · {stats.data.read} read · {stats.data.failed} not delivered ·{' '}
            {stats.data.remindersSent} reminders
          </p>
        ) : (
          <p className="text-body-sm text-text-tertiary">No messages yet.</p>
        )}
        <div className="flex flex-wrap gap-sm">
          <Button variant="secondary" onClick={() => test.mutate()} disabled={test.isPending}>
            <Send className="size-4" aria-hidden="true" />
            Send me a test message
          </Button>
          <Button asChild variant="text">
            <Link to="/reports/collections">Collections report</Link>
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        title="Confirm consent for your existing contacts?"
        description="WhatsApp only allows business messages to people who agreed to receive them. Confirm that your existing customers and vendors agreed to get invoices, receipts, reminders and orders from your business on WhatsApp. This is recorded with your name and the time, and cannot be undone here. Anyone can still reply STOP."
        confirmLabel="Yes, they agreed"
        busy={consent.isPending}
        onConfirm={() => consent.mutate()}
      />
    </div>
  );
}

function ScheduleCard({
  settings,
  saving,
  onSave,
}: {
  settings: MessagingSettings;
  saving: boolean;
  onSave: (p: MessagingSettingsPatch) => void;
}) {
  const [quietOn, setQuietOn] = useState(!!settings.quietHours);
  const [start, setStart] = useState(settings.quietHours?.start ?? '21:00');
  const [end, setEnd] = useState(settings.quietHours?.end ?? '09:00');
  const [before, setBefore] = useState(settings.reminderSchedule.beforeDue.join(', '));
  const [after, setAfter] = useState(settings.reminderSchedule.afterDue.join(', '));
  const [cap, setCap] = useState(settings.monthlyCap === null ? '' : String(settings.monthlyCap));

  const errors = {
    start: quietOn && !HHMM.test(start) ? 'Use HH:mm, e.g. 21:00' : undefined,
    end: quietOn && !HHMM.test(end) ? 'Use HH:mm, e.g. 09:00' : undefined,
    before: parseDays(before) ? undefined : 'Whole days, comma separated',
    after: parseDays(after) ? undefined : 'Whole days, comma separated',
    cap: cap.trim() && !(Number.isInteger(Number(cap)) && Number(cap) >= 0) ? 'A whole number, or empty' : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);

  return (
    <Card className="flex flex-col gap-md p-lg">
      <SectionHeader title="When" />
      <Switch checked={quietOn} onCheckedChange={setQuietOn} label={`Quiet hours (${settings.timezone})`} />
      {quietOn && (
        <div className="grid gap-md sm:grid-cols-2">
          <Input label="From" value={start} onChange={(e) => setStart(e.target.value)} placeholder="21:00" error={errors.start} />
          <Input label="Until" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="09:00" error={errors.end} />
        </div>
      )}
      <p className="text-caption text-text-tertiary">Messages wait until quiet hours end. Approval alerts go at any hour.</p>
      <div className="grid gap-md sm:grid-cols-3">
        <Input label="Reminder days before the due date" value={before} onChange={(e) => setBefore(e.target.value)} placeholder="3" error={errors.before} />
        <Input label="Reminder days after the due date" value={after} onChange={(e) => setAfter(e.target.value)} placeholder="0, 7, 15, 30" error={errors.after} />
        <Input label="Monthly message cap" value={cap} onChange={(e) => setCap(e.target.value)} placeholder="No cap" inputMode="numeric" error={errors.cap} />
      </div>
      <div>
        <Button
          disabled={invalid || saving}
          onClick={() =>
            onSave({
              quietHours: quietOn ? { start, end } : null,
              reminderSchedule: { beforeDue: parseDays(before) ?? [], afterDue: parseDays(after) ?? [] },
              monthlyCap: cap.trim() ? Number(cap) : null,
            })
          }
        >
          Save
        </Button>
      </div>
    </Card>
  );
}
