// ═══════════════════════════════════════════════════════
// FinMatrix Web — launch strings (sign-up paths, trial, demo, account control)
// ═══════════════════════════════════════════════════════
// Every new customer-facing message, in English and Urdu. Server error codes
// map here too; when a code is unknown the server's own sentence is shown.

import type { Bilingual } from './lang';

export const LAUNCH: Record<string, Bilingual> = {
  // ── Choosing how to start ──
  chooseTitle: { en: 'How would you like to start?', ur: 'آپ کیسے شروع کرنا چاہیں گے؟' },
  chooseSubtitle: {
    en: 'Start your free trial now, or ask our team to approve your account on a plan you agreed with us.',
    ur: 'ابھی مفت ٹرائل شروع کریں، یا ہماری ٹیم سے اس پلان پر اکاؤنٹ کی منظوری مانگیں جو آپ نے ہمارے ساتھ طے کیا ہے۔',
  },
  trialCardTitle: { en: 'Start my {days}-day free trial', ur: 'میرا {days} دن کا مفت ٹرائل شروع کریں' },
  trialCardBody: {
    en: 'The full Warehouse system — accounting, inventory, sales, purchasing and deliveries (one delivery rider during the trial). No payment details.',
    ur: 'مکمل ویئر ہاؤس سسٹم — اکاؤنٹنگ، انوینٹری، سیلز، خریداری اور ڈیلیوری (ٹرائل کے دوران ایک ڈیلیوری رائیڈر)۔ کسی ادائیگی کی تفصیل کی ضرورت نہیں۔',
  },
  trialCardNote: {
    en: 'Most trials start instantly; a few are checked by our team within 24 hours.',
    ur: 'زیادہ تر ٹرائل فوراً شروع ہو جاتے ہیں؛ کچھ کا جائزہ ہماری ٹیم 24 گھنٹوں کے اندر لیتی ہے۔',
  },
  startTrial: { en: 'Start my free trial', ur: 'مفت ٹرائل شروع کریں' },
  starting: { en: 'Starting…', ur: 'شروع ہو رہا ہے…' },
  approvalCardTitle: { en: 'Request account approval', ur: 'اکاؤنٹ کی منظوری کی درخواست' },
  approvalCardBody: {
    en: 'For businesses that agreed a plan with FinMatrix after a demo or a call. Our team approves your account on that plan.',
    ur: 'ان کاروباروں کے لیے جنہوں نے ڈیمو یا کال کے بعد FinMatrix کے ساتھ پلان طے کیا ہے۔ ہماری ٹیم اسی پلان پر آپ کا اکاؤنٹ منظور کرے گی۔',
  },
  planLabel: { en: 'Plan you agreed', ur: 'طے شدہ پلان' },
  planUnsure: { en: 'Not sure — FinMatrix will contact me', ur: 'یقین نہیں — FinMatrix مجھ سے رابطہ کرے' },
  noteLabel: { en: 'Note for our team (optional)', ur: 'ہماری ٹیم کے لیے نوٹ (اختیاری)' },
  requestApproval: { en: 'Request approval', ur: 'منظوری کی درخواست بھیجیں' },
  sending: { en: 'Sending…', ur: 'بھیجا جا رہا ہے…' },
  orBookDemo: { en: 'Not sure yet? Book a demo', ur: 'ابھی فیصلہ نہیں کیا؟ ڈیمو بک کریں' },
  trialUnavailable: { en: 'Free trial unavailable', ur: 'مفت ٹرائل دستیاب نہیں' },
  welcomeTrial: {
    en: 'Your free trial has started — welcome to FinMatrix.',
    ur: 'آپ کا مفت ٹرائل شروع ہو گیا — FinMatrix میں خوش آمدید۔',
  },

  // ── Account status ──
  heldTitle: { en: "We're reviewing your trial", ur: 'ہم آپ کے ٹرائل کا جائزہ لے رہے ہیں' },
  heldBody: {
    en: "We're reviewing your trial — usually within a few hours. We'll email you as soon as it starts, and this page moves on by itself.",
    ur: 'ہم آپ کے ٹرائل کا جائزہ لے رہے ہیں — عموماً چند گھنٹوں میں۔ ٹرائل شروع ہوتے ہی ہم آپ کو ای میل کریں گے، اور یہ صفحہ خود آگے بڑھ جائے گا۔',
  },
  approvalPendingTitle: { en: 'Waiting for approval', ur: 'منظوری کا انتظار' },
  approvalPendingBody: {
    en: 'Our team is reviewing your account and will switch your plan on — usually within one business day. We will email you, and this page moves on by itself.',
    ur: 'ہماری ٹیم آپ کے اکاؤنٹ کا جائزہ لے رہی ہے اور آپ کا پلان فعال کرے گی — عموماً ایک کاروباری دن میں۔ ہم آپ کو ای میل کریں گے، اور یہ صفحہ خود آگے بڑھ جائے گا۔',
  },
  rejectedTitle: { en: 'Registration not approved', ur: 'رجسٹریشن منظور نہیں ہوئی' },
  rejectedBody: {
    en: 'Your registration was not approved. Contact FinMatrix support if you believe that is a mistake.',
    ur: 'آپ کی رجسٹریشن منظور نہیں ہوئی۔ اگر آپ کے خیال میں یہ غلطی ہے تو FinMatrix سپورٹ سے رابطہ کریں۔',
  },
  reasonLabel: { en: 'Reason', ur: 'وجہ' },
  trialEndedTitle: { en: 'Your free trial has ended', ur: 'آپ کا مفت ٹرائل ختم ہو گیا' },
  trialEndedBody: {
    en: 'Your data is safe — nothing has been deleted. Download a full backup any time, or request activation and our team will switch your plan on.',
    ur: 'آپ کا ڈیٹا محفوظ ہے — کچھ بھی حذف نہیں ہوا۔ کسی بھی وقت مکمل بیک اپ ڈاؤن لوڈ کریں، یا ایکٹیویشن کی درخواست دیں اور ہماری ٹیم آپ کا پلان فعال کر دے گی۔',
  },
  planEndedTitle: { en: 'Your plan has ended', ur: 'آپ کا پلان ختم ہو گیا' },
  planEndedBody: {
    en: 'Your data is safe. Download a full backup any time, or request activation to switch your plan back on.',
    ur: 'آپ کا ڈیٹا محفوظ ہے۔ کسی بھی وقت مکمل بیک اپ ڈاؤن لوڈ کریں، یا پلان دوبارہ فعال کروانے کے لیے ایکٹیویشن کی درخواست دیں۔',
  },
  staffEndedBody: {
    en: "Your company's trial has ended — please contact the owner.",
    ur: 'آپ کی کمپنی کا ٹرائل ختم ہو گیا ہے — براہِ کرم مالک سے رابطہ کریں۔',
  },
  suspendedTitle: { en: 'Account suspended', ur: 'اکاؤنٹ معطل' },
  suspendedBody: {
    en: 'This company account is suspended by FinMatrix. Your data is safe. Contact support to restore access.',
    ur: 'FinMatrix نے اس کمپنی کا اکاؤنٹ معطل کیا ہے۔ آپ کا ڈیٹا محفوظ ہے۔ رسائی بحال کروانے کے لیے سپورٹ سے رابطہ کریں۔',
  },
  downloadData: { en: 'Download my data', ur: 'میرا ڈیٹا ڈاؤن لوڈ کریں' },
  requestActivation: { en: 'Request activation', ur: 'ایکٹیویشن کی درخواست' },
  bookCall: { en: 'Book a call', ur: 'کال بک کریں' },
  activationSent: {
    en: 'Activation requested — our team will contact you, usually within one business day.',
    ur: 'ایکٹیویشن کی درخواست بھیج دی گئی — ہماری ٹیم عموماً ایک کاروباری دن میں آپ سے رابطہ کرے گی۔',
  },
  activationPending: {
    en: 'Your activation request is with our team.',
    ur: 'آپ کی ایکٹیویشن کی درخواست ہماری ٹیم کے پاس ہے۔',
  },
  activationTitle: { en: 'Request activation', ur: 'ایکٹیویشن کی درخواست' },
  activationBody: {
    en: 'Tell us which plan you want. There is no online payment — our team agrees it with you and switches it on.',
    ur: 'ہمیں بتائیں آپ کون سا پلان چاہتے ہیں۔ کوئی آن لائن ادائیگی نہیں — ہماری ٹیم آپ کے ساتھ طے کر کے اسے فعال کر دے گی۔',
  },
  support: { en: 'Support', ur: 'سپورٹ' },

  // ── Trial banner ──
  trialDaysLeft: { en: '{n} days left in your free trial', ur: 'آپ کے مفت ٹرائل کے {n} دن باقی ہیں' },
  trialOneDayLeft: { en: 'Last day of your free trial', ur: 'آپ کے مفت ٹرائل کا آخری دن' },
  trialDayLeft: { en: '1 day left in your free trial', ur: 'آپ کے مفت ٹرائل کا 1 دن باقی ہے' },
  bookOnboarding: { en: 'Book onboarding call', ur: 'آن بورڈنگ کال بک کریں' },

  // ── Dashboard ──
  migrationCardTitle: { en: 'Bring your data from your old system', ur: 'اپنے پرانے سسٹم سے ڈیٹا لائیں' },
  migrationCardBody: {
    en: 'Move opening balances, customers, suppliers and stock in from Tally, Peachtree/Sage 50, QuickBooks, Xero, Zoho or a spreadsheet — checked to the rupee before anything is posted.',
    ur: 'Tally، Peachtree/Sage 50، QuickBooks، Xero، Zoho یا اسپریڈشیٹ سے اوپننگ بیلنس، کسٹمرز، سپلائرز اور اسٹاک منتقل کریں — کچھ بھی پوسٹ ہونے سے پہلے روپے روپے تک جانچا جاتا ہے۔',
  },
  migrationCardCta: { en: 'Move your data in', ur: 'اپنا ڈیٹا منتقل کریں' },
  migrationCardGuide: { en: 'Read the guide', ur: 'رہنمائی پڑھیں' },
  dismiss: { en: 'Dismiss', ur: 'ہٹائیں' },

  // ── Sign-in / session ──
  accountSuspended: {
    en: 'This account is suspended. Contact support.',
    ur: 'یہ اکاؤنٹ معطل ہے۔ سپورٹ سے رابطہ کریں۔',
  },
  sessionRevoked: {
    en: 'Your session has ended. Please sign in again.',
    ur: 'آپ کا سیشن ختم ہو گیا ہے۔ براہِ کرم دوبارہ سائن اِن کریں۔',
  },
  companySuspended: {
    en: 'This company account is suspended. Contact FinMatrix support.',
    ur: 'اس کمپنی کا اکاؤنٹ معطل ہے۔ FinMatrix سپورٹ سے رابطہ کریں۔',
  },

  checkAgain: { en: 'Check again', ur: 'دوبارہ چیک کریں' },
  checking: { en: 'Checking…', ur: 'چیک ہو رہا ہے…' },
  signOut: { en: 'Sign out', ur: 'سائن آؤٹ' },
  backToSignIn: { en: 'Back to sign in', ur: 'واپس سائن اِن پر' },

  // ── My account → Plan ──
  planSectionTitle: { en: 'Plan', ur: 'پلان' },
  planSectionBody: {
    en: 'Your FinMatrix plan. There is no online payment — our team switches plans on.',
    ur: 'آپ کا FinMatrix پلان۔ آن لائن ادائیگی نہیں ہوتی — پلان ہماری ٹیم فعال کرتی ہے۔',
  },
  planOnTrial: { en: 'Free trial', ur: 'مفت ٹرائل' },
  planEndsOn: { en: 'Ends {date}', ur: '{date} کو ختم ہوگا' },
  planEndedOn: { en: 'Ended {date}', ur: '{date} کو ختم ہو گیا' },
  planNoEnd: { en: 'No end date', ur: 'کوئی اختتامی تاریخ نہیں' },
  planTrialHint: {
    en: 'Want to keep going after the trial? Request activation and our team will set up your plan — your data stays as it is.',
    ur: 'ٹرائل کے بعد بھی جاری رکھنا چاہتے ہیں؟ ایکٹیویشن کی درخواست دیں، ہماری ٹیم آپ کا پلان ترتیب دے گی — آپ کا ڈیٹا ویسا ہی رہے گا۔',
  },
  planEndedHint: {
    en: 'Your plan has ended. Request activation to switch it back on — nothing has been deleted.',
    ur: 'آپ کا پلان ختم ہو گیا ہے۔ دوبارہ فعال کرنے کے لیے ایکٹیویشن کی درخواست دیں — کچھ بھی حذف نہیں ہوا۔',
  },
};

/**
 * Server codes → messages. Trial eligibility reasons arrive as
 * `details.reason` of a 409 TRIAL_NOT_ELIGIBLE (and from GET trial-eligibility).
 */
export const LAUNCH_ERRORS: Record<string, Bilingual> = {
  TRIAL_DISABLED: {
    en: "Free trials aren't available right now. Please request account approval instead.",
    ur: 'اس وقت مفت ٹرائل دستیاب نہیں ہے۔ براہِ کرم اس کے بجائے اکاؤنٹ کی منظوری کی درخواست دیں۔',
  },
  TRIAL_NOT_OWNER: {
    en: "Only the company's owner can start the free trial.",
    ur: 'مفت ٹرائل صرف کمپنی کا مالک شروع کر سکتا ہے۔',
  },
  COMPANY_NOT_DRAFT: {
    en: 'This company has already been submitted or activated, so a free trial cannot be started for it.',
    ur: 'یہ کمپنی پہلے ہی جمع یا فعال کی جا چکی ہے، اس لیے اس کے لیے مفت ٹرائل شروع نہیں کیا جا سکتا۔',
  },
  REQUEST_PENDING_REVIEW: {
    en: 'You already have a request awaiting review.',
    ur: 'آپ کی ایک درخواست پہلے ہی جائزے کے لیے زیرِ التوا ہے۔',
  },
  EMAIL_NOT_VERIFIED: {
    en: 'Please verify your email address first.',
    ur: 'براہِ کرم پہلے اپنے ای میل ایڈریس کی تصدیق کریں۔',
  },
  TRIAL_PHONE_REQUIRED: {
    en: 'A valid Pakistani phone number is required to start a free trial.',
    ur: 'مفت ٹرائل شروع کرنے کے لیے ایک درست پاکستانی فون نمبر ضروری ہے۔',
  },
  TRIAL_EMAIL_DOMAIN_BLOCKED: {
    en: "Free trials need a permanent email address. Temporary or disposable email addresses can't be used.",
    ur: 'مفت ٹرائل کے لیے مستقل ای میل ایڈریس ضروری ہے۔ عارضی یا ڈسپوزایبل ای میل استعمال نہیں کی جا سکتی۔',
  },
  TRIAL_USER_USED: {
    en: 'Your account has already used its free trial.',
    ur: 'آپ کا اکاؤنٹ اپنا مفت ٹرائل پہلے ہی استعمال کر چکا ہے۔',
  },
  TRIAL_EMAIL_USED: {
    en: 'This email address has already used its free trial.',
    ur: 'یہ ای میل ایڈریس اپنا مفت ٹرائل پہلے ہی استعمال کر چکا ہے۔',
  },
  TRIAL_PHONE_USED: {
    en: 'This phone number has already used its free trial.',
    ur: 'یہ فون نمبر اپنا مفت ٹرائل پہلے ہی استعمال کر چکا ہے۔',
  },
  TRIAL_ALREADY_USED: {
    en: 'This company has already used its free trial.',
    ur: 'یہ کمپنی اپنا مفت ٹرائل پہلے ہی استعمال کر چکی ہے۔',
  },
  TRIAL_TAX_ID_USED: {
    en: 'This NTN has already been used for a free trial.',
    ur: 'یہ این ٹی این پہلے ہی مفت ٹرائل کے لیے استعمال ہو چکا ہے۔',
  },
  NO_PLANS_FOR_COMPANY_TYPE: {
    en: "Free trials aren't available for this type of company.",
    ur: 'اس قسم کی کمپنی کے لیے مفت ٹرائل دستیاب نہیں ہے۔',
  },
  RATE_LIMIT: {
    en: 'Too many attempts. Please wait a few minutes and try again.',
    ur: 'بہت زیادہ کوششیں ہو گئیں۔ چند منٹ انتظار کر کے دوبارہ کوشش کریں۔',
  },
  TRIAL_ENDED: {
    en: 'Your free trial has ended. Your data is safe — download a backup or request activation.',
    ur: 'آپ کا مفت ٹرائل ختم ہو گیا ہے۔ آپ کا ڈیٹا محفوظ ہے — بیک اپ ڈاؤن لوڈ کریں یا ایکٹیویشن کی درخواست دیں۔',
  },
  SUBSCRIPTION_EXPIRED: {
    en: 'Your plan has ended. Your data is safe — download a backup or request activation.',
    ur: 'آپ کا پلان ختم ہو گیا ہے۔ آپ کا ڈیٹا محفوظ ہے — بیک اپ ڈاؤن لوڈ کریں یا ایکٹیویشن کی درخواست دیں۔',
  },
  COMPANY_SUSPENDED: LAUNCH.companySuspended,
  ACCOUNT_SUSPENDED: LAUNCH.accountSuspended,
  SESSION_REVOKED: LAUNCH.sessionRevoked,
  ACTIVATION_NOT_AVAILABLE: {
    en: 'Activation can be requested during or after a free trial, or after a plan has ended.',
    ur: 'ایکٹیویشن کی درخواست مفت ٹرائل کے دوران یا بعد میں، یا پلان ختم ہونے کے بعد دی جا سکتی ہے۔',
  },
  COMPANY_NOT_SUBMITTABLE: {
    en: 'This company cannot be submitted for approval now. If its trial or plan has ended, request activation instead.',
    ur: 'یہ کمپنی ابھی منظوری کے لیے جمع نہیں کی جا سکتی۔ اگر ٹرائل یا پلان ختم ہو گیا ہے تو ایکٹیویشن کی درخواست دیں۔',
  },
  INVALID_PLAN: {
    en: 'Choose one of the plans on offer, or "Not sure".',
    ur: 'پیش کردہ پلانز میں سے ایک منتخب کریں، یا "یقین نہیں"۔',
  },
  // ── Demo booking ──
  DEMO_SLOT_TAKEN: {
    en: 'That time was just taken. Please choose another.',
    ur: 'یہ وقت ابھی کسی اور نے لے لیا۔ براہِ کرم دوسرا وقت منتخب کریں۔',
  },
  DEMO_INVALID_SLOT: {
    en: 'Choose one of the times offered.',
    ur: 'پیش کردہ اوقات میں سے ایک منتخب کریں۔',
  },
  DEMO_INVALID_PHONE: {
    en: 'Enter a valid Pakistani mobile number, e.g. 0300 1234567.',
    ur: 'درست پاکستانی موبائل نمبر درج کریں، مثلاً 0300 1234567۔',
  },
  DEMO_INVALID_EMAIL: { en: 'Enter a valid email address.', ur: 'درست ای میل ایڈریس درج کریں۔' },
  DEMO_CONSENT_REQUIRED: {
    en: 'Please agree to be contacted about your demo.',
    ur: 'براہِ کرم ڈیمو کے بارے میں رابطے کی اجازت دیں۔',
  },
  DEMO_FORM_EXPIRED: {
    en: 'This form has expired. Reload the page and try again.',
    ur: 'یہ فارم پرانا ہو گیا ہے۔ صفحہ دوبارہ لوڈ کر کے کوشش کریں۔',
  },
  DEMO_VERIFICATION_FAILED: {
    en: 'Please complete the verification and try again.',
    ur: 'براہِ کرم تصدیق مکمل کر کے دوبارہ کوشش کریں۔',
  },
  DEMO_BOOKING_DISABLED: {
    en: 'Demo booking is not available right now.',
    ur: 'اس وقت ڈیمو بکنگ دستیاب نہیں ہے۔',
  },
};

/** Fill `{name}` placeholders. */
export const fill = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
