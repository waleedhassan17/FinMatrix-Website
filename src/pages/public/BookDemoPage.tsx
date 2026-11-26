// ═══════════════════════════════════════════════════════
// FinMatrix Web — Book a demo (public, no login)
// ═══════════════════════════════════════════════════════
// Replaces every mailto: demo link. Slots come from GET /public/demo-slots in
// Asia/Karachi (booked ones are not offered) with a signed form token; the
// booking goes to POST /public/demo-requests. A hidden honeypot field stays
// empty for people. UTM parameters and the referring page ride along.

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CalendarCheck, CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LangToggle } from '@/features/launch/LangToggle';
import { dirProps, pick, useLang, type Bilingual } from '@/i18n/lang';
import { LAUNCH_ERRORS } from '@/i18n/launchStrings';
import { bookDemo, getDemoSlots } from '@/networks/launch/launchNetwork';
import { CITY_SUGGESTIONS, groupSlots, PK_MOBILE } from '@/models/demoBooking';
import { ApiError } from '@/networks/network/apiHelpers';

const T: Record<string, Bilingual> = {
  title: { en: 'Book a FinMatrix demo', ur: 'FinMatrix ڈیمو بک کریں' },
  subtitle: {
    en: 'A 30-minute walkthrough with our team — your books, your stock, your deliveries, and how to move your data in from your current system.',
    ur: 'ہماری ٹیم کے ساتھ 30 منٹ کا جائزہ — آپ کے کھاتے، اسٹاک، ڈیلیوری، اور موجودہ سسٹم سے ڈیٹا منتقل کرنے کا طریقہ۔',
  },
  fullName: { en: 'Full name', ur: 'پورا نام' },
  businessName: { en: 'Business name', ur: 'کاروبار کا نام' },
  phone: { en: 'Mobile number', ur: 'موبائل نمبر' },
  email: { en: 'Email', ur: 'ای میل' },
  city: { en: 'City', ur: 'شہر' },
  businessType: { en: 'Business type', ur: 'کاروبار کی قسم' },
  teamSize: { en: 'Team size (optional)', ur: 'ٹیم کا سائز (اختیاری)' },
  currentSystem: { en: 'What do you use today? (optional)', ur: 'آپ اس وقت کیا استعمال کرتے ہیں؟ (اختیاری)' },
  language: { en: 'Preferred language', ur: 'پسندیدہ زبان' },
  slot: { en: 'Preferred date and time (Pakistan time)', ur: 'پسندیدہ تاریخ اور وقت (پاکستانی وقت)' },
  message: { en: 'Anything you want us to cover? (optional)', ur: 'کوئی خاص بات جو آپ ڈیمو میں دیکھنا چاہیں؟ (اختیاری)' },
  consent: {
    en: 'I agree to be contacted by phone, WhatsApp or email about this demo.',
    ur: 'میں اس ڈیمو کے بارے میں فون، واٹس ایپ یا ای میل کے ذریعے رابطے کی اجازت دیتا/دیتی ہوں۔',
  },
  submit: { en: 'Book my demo', ur: 'میرا ڈیمو بک کریں' },
  sending: { en: 'Booking…', ur: 'بک ہو رہا ہے…' },
  noSlots: {
    en: 'No times are open right now. Leave your details and we will call you.',
    ur: 'اس وقت کوئی وقت دستیاب نہیں۔ اپنی تفصیلات چھوڑیں، ہم آپ کو کال کریں گے۔',
  },
  doneTitle: { en: 'Your demo request is in', ur: 'آپ کی ڈیمو کی درخواست موصول ہو گئی' },
  doneBody: {
    en: 'We have emailed you a confirmation. Our team will confirm the time with you by phone, WhatsApp or email — usually within one business day — and send a calendar invite with the meeting link. You can add it to your calendar from that email.',
    ur: 'ہم نے آپ کو تصدیقی ای میل بھیج دی ہے۔ ہماری ٹیم عموماً ایک کاروباری دن میں فون، واٹس ایپ یا ای میل کے ذریعے وقت کی تصدیق کرے گی اور میٹنگ لنک کے ساتھ کیلنڈر دعوت نامہ بھیجے گی، جسے آپ اپنے کیلنڈر میں شامل کر سکتے ہیں۔',
  },
  doneNext: { en: 'Or start your free trial now', ur: 'یا ابھی اپنا مفت ٹرائل شروع کریں' },
  addToCalendar: { en: 'Add requested time to calendar', ur: 'درخواست کردہ وقت کیلنڈر میں شامل کریں' },
  backHome: { en: 'Back to home', ur: 'واپس ہوم پیج' },
  required: { en: 'Required', ur: 'ضروری' },
};

const BUSINESS_TYPES = [
  { value: 'wholesale_distribution', en: 'Wholesale / distribution', ur: 'ہول سیل / ڈسٹری بیوشن' },
  { value: 'retail', en: 'Retail', ur: 'ریٹیل' },
  { value: 'manufacturing', en: 'Manufacturing', ur: 'مینوفیکچرنگ' },
  { value: 'services', en: 'Services', ur: 'سروسز' },
  { value: 'other', en: 'Other', ur: 'دیگر' },
];
const TEAM_SIZES = ['1-5', '6-20', '21-50', '50+'];
const SYSTEMS = [
  { value: 'excel', en: 'Excel / register', ur: 'ایکسل / رجسٹر' },
  { value: 'tally', en: 'Tally', ur: 'Tally' },
  { value: 'peachtree', en: 'Peachtree / Sage 50', ur: 'Peachtree / Sage 50' },
  { value: 'quickbooks', en: 'QuickBooks', ur: 'QuickBooks' },
  { value: 'xero', en: 'Xero', ur: 'Xero' },
  { value: 'zoho', en: 'Zoho Books', ur: 'Zoho Books' },
  { value: 'odoo', en: 'Odoo', ur: 'Odoo' },
  { value: 'other', en: 'Other', ur: 'دیگر' },
  { value: 'none', en: 'Nothing yet', ur: 'ابھی کچھ نہیں' },
];
const schema = z.object({
  fullName: z.string().trim().min(2).max(80),
  businessName: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => PK_MOBILE.test(v.replace(/[\s\-().]/g, '')), 'phone'),
  email: z.string().trim().pipe(z.email()),
  city: z.string().trim().min(2).max(80),
  businessType: z.string().min(1),
  teamSize: z.string(),
  currentSystem: z.string(),
  language: z.enum(['en', 'ur']),
  slot: z.string().min(1),
  message: z.string().max(1000),
  consent: z.boolean().refine((v) => v === true),
  website: z.string(),
});
type FormValues = z.infer<typeof schema>;

function dayLabel(date: string, lang: 'en' | 'ur') {
  const d = new Date(`${date}T12:00:00+05:00`);
  return d.toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Karachi',
  });
}

function timeLabel(at: string, lang: 'en' | 'ur') {
  return new Date(at).toLocaleTimeString(lang === 'ur' ? 'ur-PK' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Karachi',
  });
}

/** A one-event .ics for the time the prospect asked for (not yet confirmed). */
function requestedIcs(at: string, minutes: number): string {
  const start = new Date(at);
  const end = new Date(start.getTime() + minutes * 60_000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FinMatrix//Demo request//EN',
    'BEGIN:VEVENT', `UID:demo-request-${start.getTime()}@finmatrix`, `DTSTAMP:${f(new Date())}`,
    `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    'SUMMARY:FinMatrix demo (requested — awaiting confirmation)',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

export default function BookDemoPage() {
  const lang = useLang();
  const location = useLocation();
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<{ at: string } | null>(null);

  const slotsQ = useQuery({ queryKey: ['public', 'demo-slots'], queryFn: getDemoSlots, staleTime: 60_000 });
  const days = useMemo(() => groupSlots(slotsQ.data?.slots ?? []), [slotsQ.data]);
  const [day, setDay] = useState<string>('');
  const activeDay = day || days[0]?.date || '';

  const utm = useMemo(() => {
    const q = new URLSearchParams(location.search);
    const out: Record<string, string> = {};
    for (const k of ['source', 'medium', 'campaign', 'term', 'content']) {
      const v = q.get(`utm_${k}`);
      if (v) out[k] = v.slice(0, 100);
    }
    return out;
  }, [location.search]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      businessName: '',
      phone: '',
      email: '',
      city: '',
      businessType: '',
      teamSize: '',
      currentSystem: '',
      language: lang,
      slot: '',
      message: '',
      consent: false,
      website: '',
    },
  });
  const slot = watch('slot');
  const err = (name: keyof FormValues): string | undefined => {
    if (!errors[name]) return undefined;
    if (name === 'phone') return pick(LAUNCH_ERRORS.DEMO_INVALID_PHONE, lang);
    if (name === 'email') return pick(LAUNCH_ERRORS.DEMO_INVALID_EMAIL, lang);
    if (name === 'consent') return pick(LAUNCH_ERRORS.DEMO_CONSENT_REQUIRED, lang);
    if (name === 'slot') return pick(LAUNCH_ERRORS.DEMO_INVALID_SLOT, lang);
    return pick(T.required, lang);
  };

  const onSubmit = async (v: FormValues) => {
    setFormError('');
    try {
      await bookDemo({
        fullName: v.fullName.trim(),
        businessName: v.businessName.trim(),
        phone: v.phone.trim(),
        email: v.email.trim(),
        city: v.city.trim(),
        businessType: v.businessType,
        teamSize: v.teamSize || undefined,
        currentSystem: v.currentSystem || undefined,
        language: v.language,
        slot: v.slot,
        message: v.message.trim() || undefined,
        consent: v.consent,
        website: v.website,
        formToken: slotsQ.data?.formToken ?? '',
        utm: Object.keys(utm).length ? utm : undefined,
        referrer: document.referrer || undefined,
        landingPath: `${location.pathname}${location.search}`.slice(0, 300),
      });
      setDone({ at: v.slot });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === 'DEMO_SLOT_TAKEN' || code === 'DEMO_FORM_EXPIRED') {
        setValue('slot', '');
        void slotsQ.refetch();
      }
      const known = code ? LAUNCH_ERRORS[code] : undefined;
      setFormError(known ? pick(known, lang) : e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  if (done) {
    const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(requestedIcs(done.at, slotsQ.data?.minutes ?? 30))}`;
    return (
      <main className="min-h-screen bg-background px-md py-xxl" {...dirProps(lang)}>
        <div className="mx-auto flex max-w-[640px] flex-col items-center gap-md rounded-xl border border-border-light bg-surface p-xl text-center shadow-lg">
          <CheckCircle2 className="size-12 text-success" aria-hidden />
          <h1 className="text-display-sm text-text-primary">{pick(T.doneTitle, lang)}</h1>
          <p className="text-body-md text-text-secondary">{pick(T.doneBody, lang)}</p>
          <p className="text-label-md text-text-primary">
            {dayLabel(new Date(new Date(done.at).getTime() + 5 * 3600_000).toISOString().slice(0, 10), lang)} ·{' '}
            {timeLabel(done.at, lang)}
          </p>
          <div className="flex w-full flex-col gap-xs sm:flex-row sm:justify-center">
            <Button variant="secondary" asChild>
              <a href={ics} download="finmatrix-demo-request.ics">
                <CalendarCheck className="size-4" /> {pick(T.addToCalendar, lang)}
              </a>
            </Button>
            <Button asChild>
              <Link to="/register">{pick(T.doneNext, lang)}</Link>
            </Button>
          </div>
          <Link to="/" className="text-label-md text-primary">
            {pick(T.backHome, lang)}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-md py-xl sm:py-xxl" {...dirProps(lang)}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mx-auto flex max-w-[760px] flex-col gap-lg rounded-xl border border-border-light bg-surface p-lg shadow-lg sm:p-xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <Link to="/" className="text-label-md text-primary">
              FinMatrix
            </Link>
            <h1 className="mt-xs text-display-sm text-text-primary">{pick(T.title, lang)}</h1>
            <p className="mt-xxs text-body-md text-text-secondary">{pick(T.subtitle, lang)}</p>
          </div>
          <LangToggle />
        </div>

        {formError && (
          <div role="alert" className="flex items-start gap-xs rounded-md bg-danger-lighter p-sm">
            <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" />
            <span className="text-body-sm text-danger">{formError}</span>
          </div>
        )}

        <div className="grid gap-md sm:grid-cols-2">
          <Input label={pick(T.fullName, lang)} autoComplete="name" error={err('fullName')} {...register('fullName')} />
          <Input label={pick(T.businessName, lang)} autoComplete="organization" error={err('businessName')} {...register('businessName')} />
          <Input label={pick(T.phone, lang)} type="tel" inputMode="tel" placeholder="0300 1234567" autoComplete="tel" error={err('phone')} {...register('phone')} />
          <Input label={pick(T.email, lang)} type="email" inputMode="email" autoComplete="email" error={err('email')} {...register('email')} />
          <div>
            <Input label={pick(T.city, lang)} list="demo-cities" autoComplete="address-level2" error={err('city')} {...register('city')} />
            <datalist id="demo-cities">
              {CITY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Select
            label={pick(T.businessType, lang)}
            value={watch('businessType')}
            onChange={(v) => setValue('businessType', v, { shouldValidate: true })}
            options={BUSINESS_TYPES.map((b) => ({ value: b.value, label: b[lang] }))}
            error={err('businessType')}
          />
          <Select
            label={pick(T.teamSize, lang)}
            value={watch('teamSize')}
            onChange={(v) => setValue('teamSize', v)}
            options={TEAM_SIZES.map((t) => ({ value: t, label: t }))}
          />
          <Select
            label={pick(T.currentSystem, lang)}
            value={watch('currentSystem')}
            onChange={(v) => setValue('currentSystem', v)}
            options={SYSTEMS.map((s) => ({ value: s.value, label: s[lang] }))}
          />
          <Select
            label={pick(T.language, lang)}
            value={watch('language')}
            onChange={(v) => setValue('language', v as 'en' | 'ur')}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ur', label: 'اردو' },
            ]}
          />
        </div>

        <fieldset className="flex flex-col gap-sm">
          <legend className="text-label-md text-text-secondary">{pick(T.slot, lang)}</legend>
          {slotsQ.isLoading ? (
            <div className="h-24 animate-pulse rounded-md bg-neutral-100" />
          ) : days.length === 0 ? (
            <p className="text-body-sm text-text-secondary">{pick(T.noSlots, lang)}</p>
          ) : (
            <>
              <div className="flex gap-xs overflow-x-auto pb-xxs" role="tablist" aria-label="Day">
                {days.map((d) => (
                  <button
                    key={d.date}
                    type="button"
                    role="tab"
                    aria-selected={d.date === activeDay}
                    onClick={() => setDay(d.date)}
                    className={`shrink-0 rounded-md border px-sm py-xs text-label-md ${
                      d.date === activeDay ? 'border-primary bg-primary-tint text-primary' : 'border-border-light text-text-secondary'
                    }`}
                  >
                    {dayLabel(d.date, lang)}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-xs sm:grid-cols-6" data-testid="slot-grid">
                {(days.find((d) => d.date === activeDay)?.slots ?? []).map((s) => (
                  <button
                    key={s.at}
                    type="button"
                    aria-pressed={slot === s.at}
                    onClick={() => setValue('slot', s.at, { shouldValidate: true })}
                    className={`rounded-md border px-xs py-xs text-label-md ${
                      slot === s.at ? 'border-primary bg-primary text-text-inverse' : 'border-border-light text-text-primary'
                    }`}
                  >
                    {timeLabel(s.at, lang)}
                  </button>
                ))}
              </div>
            </>
          )}
          {err('slot') && <span className="text-caption text-danger">{err('slot')}</span>}
        </fieldset>

        <Textarea label={pick(T.message, lang)} rows={3} maxLength={1000} error={err('message')} {...register('message')} />

        {/* Honeypot: hidden from people (and screen readers), filled by bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
          </label>
        </div>

        <label className="flex items-start gap-sm text-body-sm text-text-primary">
          <input type="checkbox" className="mt-[3px] size-4" {...register('consent')} />
          <span>{pick(T.consent, lang)}</span>
        </label>
        {err('consent') && <span className="-mt-md text-caption text-danger">{err('consent')}</span>}

        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? pick(T.sending, lang) : pick(T.submit, lang)}
        </Button>
      </form>
    </main>
  );
}
