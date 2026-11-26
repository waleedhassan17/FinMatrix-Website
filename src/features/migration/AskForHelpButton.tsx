import { LifeBuoy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Field';
import { migrationErrorMessage } from '@/config/migrationErrors';
import { supportReference } from '@/config/migrationSources';
import { type Bilingual, dirProps, pick, useLang } from '@/i18n/lang';
import { fill } from '@/i18n/launchStrings';
import { ApiError } from '@/networks/network/apiHelpers';
import { requestMigrationHelp } from '@/networks/settings/migrationNetwork';

const T: Record<string, Bilingual> = {
  button: { en: 'Ask for help', ur: 'مدد مانگیں' },
  title: { en: 'Ask FinMatrix for help', ur: 'FinMatrix سے مدد مانگیں' },
  body: {
    en: 'We send our support team this migration’s reference ({ref}), its open problems and check results — not your figures or files. They reply by email, usually within one business day.',
    ur: 'ہم اپنی سپورٹ ٹیم کو اس مائیگریشن کا حوالہ ({ref})، اس کے کھلے مسائل اور جانچ کے نتائج بھیجتے ہیں — آپ کے اعداد یا فائلیں نہیں۔ وہ عموماً ایک کاروباری دن میں ای میل پر جواب دیتے ہیں۔',
  },
  message: { en: 'What do you need help with? (optional)', ur: 'آپ کو کس چیز میں مدد چاہیے؟ (اختیاری)' },
  send: { en: 'Send to support', ur: 'سپورٹ کو بھیجیں' },
  sending: { en: 'Sending…', ur: 'بھیجا جا رہا ہے…' },
  sent: { en: 'Sent — quote {ref} if you write to us.', ur: 'بھیج دیا گیا — ہمیں لکھیں تو {ref} کا حوالہ دیں۔' },
  noInbox: {
    en: 'Recorded. Our support inbox is not set up on this server — quote {ref} when you contact us.',
    ur: 'درج کر لیا گیا۔ اس سرور پر سپورٹ ای میل ترتیب نہیں — رابطہ کریں تو {ref} کا حوالہ دیں۔',
  },
};

/**
 * Sends this migration to FinMatrix support (POST /migrations/:id/help-request):
 * the reference, open problems and check results, plus the owner's note. It
 * replaced a mailto: link, so it works without a mail client and support gets
 * the facts it needs.
 */
export function AskForHelpButton({ batchId }: { batchId: string }) {
  const lang = useLang();
  const ref = supportReference(batchId);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const r = await requestMigrationHelp(batchId, message);
      toast.success(fill(pick(r.sent ? T.sent : T.noInbox, lang), { ref: r.reference || ref }));
      setMessage('');
      setOpen(false);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      toast.error(migrationErrorMessage(err?.code, err?.message ?? (e instanceof Error ? e.message : null), lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="text" size="sm" onClick={() => setOpen(true)} aria-label={pick(T.button, lang)}>
        <LifeBuoy className="h-4 w-4" aria-hidden />
        {pick(T.button, lang)}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={pick(T.title, lang)}
        description={<span {...dirProps(lang)}>{fill(pick(T.body, lang), { ref })}</span>}
        confirmLabel={busy ? pick(T.sending, lang) : pick(T.send, lang)}
        cancelLabel={lang === 'ur' ? 'منسوخ' : 'Cancel'}
        busy={busy}
        onConfirm={() => void send()}
      >
        <div {...dirProps(lang)}>
          <Textarea
            label={pick(T.message, lang)}
            value={message}
            maxLength={1000}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}

export default AskForHelpButton;
