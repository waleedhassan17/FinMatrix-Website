// ═══════════════════════════════════════════════════════
// FinMatrix Web — Book a Demo (/book-demo)
// ═══════════════════════════════════════════════════════
// Left: what the demo is — what we cover, how it works, what it costs (nothing).
// Right: the booking, in three short sections:
//   1. Pick a time  — day cards with free-slot counts, times grouped by part
//                     of the day, all in Pakistan time (from /public/demo-slots)
//   2. Your details — name, business, mobile (Pakistani), email, city
//   3. Your business — type (required), team size and current system (optional)
// Choices are tappable chips rather than dropdowns: a prospect on a phone
// answers in three taps. A live summary keeps the chosen time in view, and a
// failed submit scrolls to the first thing missing. The honeypot, the signed
// form token and consent go to the server exactly as before.

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  DatabaseZap,
  Mail,
  MessageCircle,
  Package,
  PhoneCall,
  ShieldCheck,
  Truck,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';

import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { LAUNCH_ERRORS } from '@/config/launchStrings';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { cn } from '@/lib/cn';
import {
  CITY_SUGGESTIONS,
  dayParts,
  groupSlots,
  PERIOD_LABEL,
  PK_MOBILE,
  slotLongLabel,
  slotsByPeriod,
  slotTimeLabel,
} from '@/models/demoBooking';
import { bookDemo, getDemoSlots } from '@/networks/launch/launchNetwork';
import { ApiError } from '@/networks/network/apiHelpers';

const BUSINESS_TYPES = [
  { value: 'wholesale_distribution', label: 'Wholesale / distribution' },
  { value: 'retail', label: 'Retail' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'services', label: 'Services' },
  { value: 'other', label: 'Other' },
];
const TEAM_SIZES = [
  { value: '1-5', label: '1–5' },
  { value: '6-20', label: '6–20' },
  { value: '21-50', label: '21–50' },
  { value: '50+', label: '50+' },
];
const SYSTEMS = [
  { value: 'excel', label: 'Excel / register' },
  { value: 'tally', label: 'Tally' },
  { value: 'peachtree', label: 'Peachtree / Sage 50' },
  { value: 'quickbooks', label: 'QuickBooks' },
  { value: 'xero', label: 'Xero' },
  { value: 'zoho', label: 'Zoho Books' },
  { value: 'odoo', label: 'Odoo' },
  { value: 'other', label: 'Something else' },
  { value: 'none', label: 'Nothing yet' },
];

const COVERS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: BarChart3, title: 'Your books and reports', body: 'Invoices, bills, payments and the reports you close the month with.' },
  { icon: Package, title: 'Stock, sales and purchasing', body: 'Items, warehouses, purchase orders and what your stock is worth today.' },
  { icon: Truck, title: 'Deliveries with riders', body: 'Assign, track and settle deliveries — cash and returns included.' },
  { icon: DatabaseZap, title: 'Moving your data in', body: 'From Tally, Peachtree, QuickBooks or Excel, checked to the rupee.' },
];

const STEPS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: CalendarClock, title: 'Pick a time', body: 'any open slot, in Pakistan time.' },
  { icon: PhoneCall, title: 'We confirm', body: 'by phone, WhatsApp or email — usually within one business day.' },
  { icon: Video, title: 'Join the call', body: 'a calendar invite brings the meeting link.' },
];

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(80),
  businessName: z.string().trim().min(2, 'Enter your business name.').max(120),
  phone: z
    .string()
    .trim()
    .refine((v) => PK_MOBILE.test(v.replace(/[\s\-().]/g, '')), LAUNCH_ERRORS.DEMO_INVALID_PHONE),
  email: z.string().trim().pipe(z.email(LAUNCH_ERRORS.DEMO_INVALID_EMAIL)),
  city: z.string().trim().min(2, 'Enter your city.').max(80),
  businessType: z.string().min(1, 'Choose your type of business.'),
  teamSize: z.string(),
  currentSystem: z.string(),
  slot: z.string().min(1, 'Choose a time for your demo.'),
  message: z.string().max(1000),
  consent: z.boolean().refine((v) => v === true, LAUNCH_ERRORS.DEMO_CONSENT_REQUIRED),
  website: z.string(),
});
type FormValues = z.infer<typeof schema>;

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

const whatsappHref = (n: string) => `https://wa.me/${n.replace(/\D/g, '')}`;

export default function BookDemoPage() {
  const location = useLocation();
  const config = usePublicConfig();
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<{ at: string } | null>(null);
  const timeRef = useRef<HTMLElement>(null);
  const businessRef = useRef<HTMLElement>(null);

  const slotsQ = useQuery({ queryKey: ['public', 'demo-slots'], queryFn: getDemoSlots, staleTime: 60_000 });
  const days = useMemo(() => groupSlots(slotsQ.data?.slots ?? []), [slotsQ.data]);
  const [day, setDay] = useState<string>('');
  const activeDay = day || days[0]?.date || '';
  const minutes = slotsQ.data?.minutes ?? 30;

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
      slot: '',
      message: '',
      consent: false,
      website: '',
    },
  });
  const slot = watch('slot');
  const businessType = watch('businessType');
  const teamSize = watch('teamSize');
  const currentSystem = watch('currentSystem');

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
      window.scrollTo?.({ top: 0 });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === 'DEMO_SLOT_TAKEN' || code === 'DEMO_FORM_EXPIRED') {
        setValue('slot', '');
        void slotsQ.refetch();
        timeRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }
      const known = code ? LAUNCH_ERRORS[code] : undefined;
      setFormError(known ?? (e instanceof Error ? e.message : 'Something went wrong. Please try again.'));
    }
  };

  // Text fields scroll themselves into view; the time and business choices
  // are buttons, so a missing one scrolls its section instead.
  const onInvalid = (errs: Partial<Record<keyof FormValues, unknown>>) => {
    const fieldMissing = errs.fullName || errs.businessName || errs.phone || errs.email || errs.city;
    if (errs.slot) timeRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    else if (errs.businessType && !fieldMissing) businessRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  if (done) return <DoneScreen at={done.at} minutes={minutes} />;

  const daySlots = days.find((d) => d.date === activeDay)?.slots ?? [];

  return (
    <div className="min-h-screen bg-background">
      <TopBar />

      {/* One column on a phone (min-w-0, so the day strip scrolls inside its
          own row instead of widening the page); two from lg. On a phone the
          form comes straight after a short intro, and the "what we'll cover"
          panel follows it. */}
      <main className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-xl px-md pt-xs pb-section lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-xxxl lg:px-xl lg:pt-xl">
        <div className="order-1 lg:hidden">
          <p className="inline-flex items-center gap-xs text-label-sm text-text-secondary">
            <Clock className="size-3.5 text-success" aria-hidden="true" />
            Free · {minutes} minutes · Online
          </p>
          <h1 className="mt-xs text-display-sm text-text-primary">See FinMatrix on your own business</h1>
          <p className="mt-xxs text-body-md text-text-secondary">
            A specialist walks you through it with your kind of business in mind.
          </p>
        </div>

        {/* ── What the demo is ── */}
        <aside className="order-3 min-w-0 lg:sticky lg:top-xl lg:order-none lg:self-start">
          <div className="relative isolate overflow-hidden rounded-2xl surface-mesh-navy p-xl text-text-inverse lg:p-xxl">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial" />
            <div className="hidden lg:block">
              <p className="inline-flex items-center gap-xs rounded-full glass-dark px-sm py-xxs text-label-sm text-white/85">
                <Clock className="size-3.5 text-success-bright" aria-hidden="true" />
                Free · {minutes} minutes · Online
              </p>
              <h1 className="mt-lg text-balance text-hero-md text-text-inverse">See FinMatrix on your own business</h1>
              <p className="mt-sm text-pretty text-body-md text-white/75">
                A FinMatrix specialist walks you through the system with your kind of business in mind — and answers every
                question you bring.
              </p>
            </div>

            <h2 className="text-overline text-white/60 lg:mt-xxl">What we&apos;ll cover</h2>
            <ul className="mt-sm grid gap-md">
              {COVERS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-sm">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <Icon className="size-4 text-success-bright" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-label-md text-text-inverse">{title}</span>
                    <span className="block text-body-sm text-white/65">{body}</span>
                  </span>
                </li>
              ))}
            </ul>

            <h2 className="mt-xxl text-overline text-white/60">How it works</h2>
            <ol className="mt-sm grid gap-sm">
              {STEPS.map(({ icon: Icon, title, body }, i) => (
                <li key={title} className="flex items-start gap-sm">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-label-sm text-text-inverse">
                    {i + 1}
                  </span>
                  <span className="text-body-sm text-white/75">
                    <span className="inline-flex items-center gap-xxs text-label-md text-text-inverse">
                      <Icon className="size-3.5" aria-hidden="true" /> {title}
                    </span>{' '}
                    — {body}
                  </span>
                </li>
              ))}
            </ol>

            <ul className="mt-xxl flex flex-wrap gap-x-lg gap-y-xs border-t border-white/10 pt-lg">
              {['No payment details', 'No obligation', 'Pakistan time'].map((t) => (
                <li key={t} className="flex items-center gap-xxs text-body-sm text-white/80">
                  <Check className="size-3.5 text-success-bright" aria-hidden="true" /> {t}
                </li>
              ))}
            </ul>
          </div>

          {(config.supportWhatsapp || config.supportEmail) && (
            <div className="mt-md flex flex-wrap items-center gap-x-md gap-y-xs rounded-xl border border-border-light bg-surface px-lg py-md">
              <span className="text-label-md text-text-primary">Rather talk now?</span>
              {config.supportWhatsapp && (
                <a
                  className="inline-flex items-center gap-xxs text-label-md text-primary hover:underline"
                  href={whatsappHref(config.supportWhatsapp)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp us
                </a>
              )}
              {config.supportEmail && (
                <a className="inline-flex items-center gap-xxs text-label-md text-primary hover:underline" href={`mailto:${config.supportEmail}`}>
                  <Mail className="size-4" aria-hidden="true" /> {config.supportEmail}
                </a>
              )}
            </div>
          )}
        </aside>

        {/* ── The booking ── */}
        <form
          onSubmit={handleSubmit(onSubmit, onInvalid)}
          noValidate
          aria-label="Book a demo"
          className="order-2 flex min-w-0 flex-col rounded-2xl border border-border-light bg-surface shadow-lg lg:order-none"
        >
          <div className="border-b border-border-light px-lg py-lg lg:px-xxl">
            <h2 className="text-h3 text-text-primary">Book your demo</h2>
            <p className="mt-xxs text-body-sm text-text-secondary">Takes about a minute. We&apos;ll confirm the time with you.</p>
          </div>

          {!config.demoBookingEnabled ? (
            <div className="px-lg py-xxl text-center lg:px-xxl">
              <p className="text-body-md text-text-primary">Online booking is paused right now.</p>
              <p className="mt-xs text-body-sm text-text-secondary">Message or email us and we&apos;ll set up a time.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-xxl px-lg py-xl lg:px-xxl">
                {formError && (
                  <div role="alert" className="flex items-start gap-xs rounded-md bg-danger-lighter p-sm">
                    <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" aria-hidden="true" />
                    <span className="text-body-sm text-danger">{formError}</span>
                  </div>
                )}

                {/* 1 ── Time */}
                <Section sectionRef={timeRef} step={1} title="Pick a time" hint="All times are Pakistan time (PKT).">
                  {slotsQ.isLoading ? (
                    <div className="flex flex-col gap-sm" aria-busy="true">
                      <div className="h-20 animate-pulse rounded-lg bg-background-alt" />
                      <div className="h-24 animate-pulse rounded-lg bg-background-alt" />
                    </div>
                  ) : days.length === 0 ? (
                    <p className="rounded-lg bg-background-alt p-md text-body-sm text-text-secondary">
                      No times are open right now. Leave your details below and we&apos;ll call you to arrange one.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-md">
                      <div className="-mx-xxs flex gap-xs overflow-x-auto px-xxs pb-xxs" role="tablist" aria-label="Day">
                        {days.map((d) => {
                          const p = dayParts(d.date);
                          const active = d.date === activeDay;
                          return (
                            <button
                              key={d.date}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              aria-label={`${p.weekday} ${p.day} ${p.month}, ${d.slots.length} times free`}
                              onClick={() => setDay(d.date)}
                              className={cn(
                                'flex w-[76px] shrink-0 flex-col items-center rounded-lg border px-xs py-xs transition-colors',
                                active
                                  ? 'border-primary bg-primary text-text-inverse shadow-sm'
                                  : 'border-border-light bg-surface text-text-primary hover:border-primary',
                              )}
                            >
                              <span className={cn('text-caption', active ? 'text-white/80' : 'text-text-secondary')}>{p.weekday}</span>
                              <span className="text-h3">{p.day}</span>
                              <span className={cn('text-caption', active ? 'text-white/80' : 'text-text-secondary')}>{p.month}</span>
                              <span className={cn('mt-xxs text-caption', active ? 'text-success-bright' : 'text-success')}>
                                {d.slots.length} free
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex flex-col gap-md" data-testid="slot-grid">
                        {slotsByPeriod(daySlots).map((g) => (
                          <div key={g.period}>
                            <p className="mb-xs text-label-sm text-text-secondary">{PERIOD_LABEL[g.period]}</p>
                            <div className="grid grid-cols-3 gap-xs sm:grid-cols-4">
                              {g.slots.map((s) => {
                                const chosen = slot === s.at;
                                return (
                                  <button
                                    key={s.at}
                                    type="button"
                                    aria-pressed={chosen}
                                    onClick={() => setValue('slot', s.at, { shouldValidate: true })}
                                    className={cn(
                                      'rounded-md border px-xs py-xs text-label-md transition-colors',
                                      chosen
                                        ? 'border-primary bg-primary text-text-inverse'
                                        : 'border-border-light bg-surface text-text-primary hover:border-primary hover:bg-primary-50',
                                    )}
                                  >
                                    {slotTimeLabel(s.at)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {slot ? (
                    <p
                      className="flex items-center gap-xs rounded-md bg-success-lighter px-sm py-xs text-body-sm text-text-primary"
                      data-testid="slot-summary"
                    >
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                      {slotLongLabel(slot)} · {minutes} min
                    </p>
                  ) : (
                    errors.slot && <FieldError>{errors.slot.message}</FieldError>
                  )}
                </Section>

                {/* 2 ── Details */}
                <Section step={2} title="Your details">
                  <div className="grid gap-md sm:grid-cols-2">
                    <Input label="Full name" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
                    <Input label="Business name" autoComplete="organization" error={errors.businessName?.message} {...register('businessName')} />
                    <Input
                      label="Mobile number"
                      type="tel"
                      inputMode="tel"
                      placeholder="0300 1234567"
                      autoComplete="tel"
                      hint="We'll confirm on this number — WhatsApp works too."
                      error={errors.phone?.message}
                      {...register('phone')}
                    />
                    <Input
                      label="Email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      hint="The calendar invite goes here."
                      error={errors.email?.message}
                      {...register('email')}
                    />
                    <div className="sm:col-span-2">
                      <Input label="City" list="demo-cities" autoComplete="address-level2" error={errors.city?.message} {...register('city')} />
                      <datalist id="demo-cities">
                        {CITY_SUGGESTIONS.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>
                  </div>
                </Section>

                {/* 3 ── Business */}
                <Section sectionRef={businessRef} step={3} title="Your business" hint="So the demo shows what matters to you.">
                  <ChoiceGroup
                    label="Type of business"
                    options={BUSINESS_TYPES}
                    value={businessType}
                    onChange={(v) => setValue('businessType', v, { shouldValidate: true })}
                    error={errors.businessType?.message}
                  />
                  <ChoiceGroup
                    label="Team size"
                    optional
                    options={TEAM_SIZES}
                    value={teamSize}
                    onChange={(v) => setValue('teamSize', teamSize === v ? '' : v)}
                  />
                  <ChoiceGroup
                    label="What do you use today?"
                    optional
                    options={SYSTEMS}
                    value={currentSystem}
                    onChange={(v) => setValue('currentSystem', currentSystem === v ? '' : v)}
                  />
                  <Textarea
                    label="Anything you'd like us to cover? (optional)"
                    rows={3}
                    maxLength={1000}
                    placeholder="e.g. how riders settle cash, or moving five years of Tally data"
                    error={errors.message?.message}
                    {...register('message')}
                  />
                </Section>

                {/* Honeypot: hidden from people (and screen readers), filled by bots. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input type="text" tabIndex={-1} autoComplete="off" {...register('website')} />
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-md rounded-b-2xl border-t border-border-light bg-background-alt px-lg py-lg lg:px-xxl">
                <label className="flex items-start gap-sm text-body-sm text-text-primary">
                  <input type="checkbox" className="mt-[3px] size-4 accent-primary" {...register('consent')} />
                  <span>I agree to be contacted by phone, WhatsApp or email about this demo.</span>
                </label>
                {errors.consent && <FieldError>{errors.consent.message}</FieldError>}
                <div className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-xs text-body-sm text-text-secondary">
                    <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
                    {slot ? slotLongLabel(slot) : 'Choose a time above'}
                  </p>
                  <Button type="submit" size="lg" disabled={isSubmitting} className="sm:min-w-[200px]">
                    {isSubmitting ? 'Booking…' : 'Book my demo'}
                    {!isSubmitting && <ArrowRight className="size-4" aria-hidden="true" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </form>
      </main>
    </div>
  );
}

function TopBar() {
  return (
    <header className="mx-auto flex max-w-[1180px] items-center justify-between px-md py-md lg:px-xl">
      <Link to="/" className="flex items-center gap-xs text-brand-ink" aria-label="FinMatrix home">
        <LogoMark className="size-7" />
        <span className="font-display text-h4 tracking-tight">FinMatrix</span>
      </Link>
      <Link to="/" className="inline-flex items-center gap-xxs text-label-md text-text-secondary hover:text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> Back to home
      </Link>
    </header>
  );
}

function Section({
  sectionRef,
  step,
  title,
  hint,
  children,
}: {
  sectionRef?: Ref<HTMLElement>;
  step: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section ref={sectionRef} className="scroll-mt-xl" aria-labelledby={`demo-step-${step}`}>
      <div className="mb-md flex items-start gap-sm">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-tint text-label-sm text-primary">
          {step}
        </span>
        <div>
          <h3 id={`demo-step-${step}`} className="text-label-lg text-text-primary">
            {title}
          </h3>
          {hint && <p className="text-body-sm text-text-secondary">{hint}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-lg sm:pl-[40px]">{children}</div>
    </section>
  );
}

function ChoiceGroup({
  label,
  options,
  value,
  onChange,
  optional,
  error,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
  error?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} aria-invalid={!!error}>
      <p className="mb-xs text-label-md text-text-secondary">
        {label}
        {optional && <span className="text-text-tertiary"> (optional)</span>}
      </p>
      <div className="flex flex-wrap gap-xs">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.value)}
              className={cn(
                'inline-flex items-center gap-xxs rounded-full border px-md py-xs text-label-md transition-colors',
                on ? 'border-primary bg-primary-tint text-primary' : 'border-border-light bg-surface text-text-primary hover:border-primary',
              )}
            >
              {on && <Check className="size-3.5" aria-hidden="true" />}
              {o.label}
            </button>
          );
        })}
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="mt-xs flex items-center gap-xxs text-caption text-danger">
      <AlertCircle className="size-3.5" aria-hidden="true" /> {children}
    </p>
  );
}

function DoneScreen({ at, minutes }: { at: string; minutes: number }) {
  const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(requestedIcs(at, minutes))}`;
  const next = [
    { icon: PhoneCall, title: 'We confirm the time', body: 'By phone, WhatsApp or email — usually within one business day.' },
    { icon: CalendarCheck, title: 'You get a calendar invite', body: 'With the meeting link, sent to the email you gave us.' },
    { icon: Video, title: 'We meet online', body: `${minutes} minutes, on your kind of business. Bring your questions.` },
  ];
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-[680px] px-md pt-md pb-section">
        <div className="overflow-hidden rounded-2xl border border-border-light bg-surface shadow-lg">
          <div className="flex flex-col items-center gap-sm px-lg pt-xxl pb-xl text-center lg:px-xxl">
            <span className="flex size-14 items-center justify-center rounded-full bg-success-lighter">
              <CheckCircle2 className="size-8 text-success" aria-hidden="true" />
            </span>
            <h1 className="text-display-sm text-text-primary">Your demo request is in</h1>
            <p className="max-w-[460px] text-body-md text-text-secondary">
              We&apos;ve emailed you a confirmation. This is the time you asked for:
            </p>
            <p className="mt-xs inline-flex items-center gap-xs rounded-lg bg-primary-tint px-md py-sm text-label-lg text-primary" data-testid="done-time">
              <CalendarClock className="size-5" aria-hidden="true" />
              {slotLongLabel(at)} (PKT)
            </p>
          </div>

          <div className="border-t border-border-light px-lg py-xl lg:px-xxl">
            <h2 className="text-overline text-text-secondary">What happens next</h2>
            <ol className="mt-md grid gap-md">
              {next.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-sm">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-tint">
                    <Icon className="size-4 text-primary" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-label-md text-text-primary">{title}</span>
                    <span className="block text-body-sm text-text-secondary">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-col gap-sm border-t border-border-light bg-background-alt px-lg py-lg sm:flex-row sm:justify-end lg:px-xxl">
            <Button variant="secondary" asChild>
              <a href={ics} download="finmatrix-demo-request.ics">
                <CalendarCheck className="size-4" aria-hidden="true" /> Add to calendar
              </a>
            </Button>
            <Button asChild>
              <Link to="/register">
                Start your free trial now <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
        <p className="mt-md text-center">
          <Link to="/" className="text-label-md text-primary hover:underline">
            Back to home
          </Link>
        </p>
      </main>
    </div>
  );
}
