// ═══════════════════════════════════════════════════════
// FinMatrix Web — launch copy (sign-up paths, trial, demo, account control)
// ═══════════════════════════════════════════════════════
// Every launch message in one place. Server error codes map here too; when a
// code is unknown the server's own sentence is shown.

export const LAUNCH: Record<string, string> = {
  // ── Choosing how to start ──
  chooseTitle: 'How would you like to start?',
  chooseSubtitle: 'Start your free trial now, or ask our team to approve your account on a plan you agreed with us.',
  trialCardTitle: 'Start my {days}-day free trial',
  trialCardBody: 'The full Warehouse system — accounting, inventory, sales, purchasing and deliveries (one delivery rider during the trial). No payment details.',
  trialCardNote: 'Most trials start instantly; a few are checked by our team within 24 hours.',
  startTrial: 'Start my free trial',
  starting: 'Starting…',
  approvalCardTitle: 'Request account approval',
  approvalCardBody: 'For businesses that agreed a plan with FinMatrix after a demo or a call. Our team approves your account on that plan.',
  planLabel: 'Plan you agreed',
  planUnsure: 'Not sure — FinMatrix will contact me',
  noteLabel: 'Note for our team (optional)',
  requestApproval: 'Request approval',
  sending: 'Sending…',
  orBookDemo: 'Not sure yet? Book a demo',
  trialUnavailable: 'Free trial unavailable',
  welcomeTrial: 'Your free trial has started — welcome to FinMatrix.',

  // ── Account status ──
  heldTitle: "We're reviewing your trial",
  heldBody: "We're reviewing your trial — usually within a few hours. We'll email you as soon as it starts, and this page moves on by itself.",
  approvalPendingTitle: 'Waiting for approval',
  approvalPendingBody: 'Our team is reviewing your account and will switch your plan on — usually within one business day. We will email you, and this page moves on by itself.',
  rejectedTitle: 'Registration not approved',
  rejectedBody: 'Your registration was not approved. Contact FinMatrix support if you believe that is a mistake.',
  reasonLabel: 'Reason',
  trialEndedTitle: 'Your free trial has ended',
  trialEndedBody: 'Your data is safe — nothing has been deleted. Download a full backup any time, or request activation and our team will switch your plan on.',
  planEndedTitle: 'Your plan has ended',
  planEndedBody: 'Your data is safe. Download a full backup any time, or request activation to switch your plan back on.',
  staffEndedBody: "Your company's trial has ended — please contact the owner.",
  suspendedTitle: 'Account suspended',
  suspendedBody: 'This company account is suspended by FinMatrix. Your data is safe. Contact support to restore access.',
  downloadData: 'Download my data',
  requestActivation: 'Request activation',
  bookCall: 'Book a call',
  activationSent: 'Activation requested — our team will contact you, usually within one business day.',
  activationPending: 'Your activation request is with our team.',
  activationTitle: 'Request activation',
  activationBody: 'Tell us which plan you want. There is no online payment — our team agrees it with you and switches it on.',
  support: 'Support',

  // ── Trial banner ──
  trialDaysLeft: '{n} days left in your free trial',
  trialOneDayLeft: 'Last day of your free trial',
  trialDayLeft: '1 day left in your free trial',
  bookOnboarding: 'Book onboarding call',

  // ── Dashboard ──
  migrationCardTitle: 'Bring your data from your old system',
  migrationCardBody: 'Move opening balances, customers, suppliers and stock in from Tally, Peachtree/Sage 50, QuickBooks, Xero, Zoho or a spreadsheet — checked to the rupee before anything is posted.',
  migrationCardCta: 'Move your data in',
  migrationCardGuide: 'Read the guide',
  dismiss: 'Dismiss',

  // ── Sign-in / session ──
  accountSuspended: 'This account is suspended. Contact support.',
  sessionRevoked: 'Your session has ended. Please sign in again.',
  companySuspended: 'This company account is suspended. Contact FinMatrix support.',

  checkAgain: 'Check again',
  checking: 'Checking…',
  signOut: 'Sign out',
  backToSignIn: 'Back to sign in',

  // ── My account → Plan ──
  planSectionTitle: 'Plan',
  planSectionBody: 'Your FinMatrix plan. There is no online payment — our team switches plans on.',
  planOnTrial: 'Free trial',
  planEndsOn: 'Ends {date}',
  planEndedOn: 'Ended {date}',
  planNoEnd: 'No end date',
  planTrialHint: 'Want to keep going after the trial? Request activation and our team will set up your plan — your data stays as it is.',
  planEndedHint: 'Your plan has ended. Request activation to switch it back on — nothing has been deleted.',
};

/**
 * Server codes → messages. Trial eligibility reasons arrive as
 * `details.reason` of a 409 TRIAL_NOT_ELIGIBLE (and from GET trial-eligibility).
 */
export const LAUNCH_ERRORS: Record<string, string> = {
  TRIAL_DISABLED: "Free trials aren't available right now. Please request account approval instead.",
  TRIAL_NOT_OWNER: "Only the company's owner can start the free trial.",
  COMPANY_NOT_DRAFT: 'This company has already been submitted or activated, so a free trial cannot be started for it.',
  REQUEST_PENDING_REVIEW: 'You already have a request awaiting review.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address first.',
  TRIAL_PHONE_REQUIRED: 'A valid Pakistani phone number is required to start a free trial.',
  TRIAL_EMAIL_DOMAIN_BLOCKED: "Free trials need a permanent email address. Temporary or disposable email addresses can't be used.",
  TRIAL_USER_USED: 'Your account has already used its free trial.',
  TRIAL_EMAIL_USED: 'This email address has already used its free trial.',
  TRIAL_PHONE_USED: 'This phone number has already used its free trial.',
  TRIAL_ALREADY_USED: 'This company has already used its free trial.',
  TRIAL_TAX_ID_USED: 'This NTN has already been used for a free trial.',
  NO_PLANS_FOR_COMPANY_TYPE: "Free trials aren't available for this type of company.",
  RATE_LIMIT: 'Too many attempts. Please wait a few minutes and try again.',
  TRIAL_ENDED: 'Your free trial has ended. Your data is safe — download a backup or request activation.',
  SUBSCRIPTION_EXPIRED: 'Your plan has ended. Your data is safe — download a backup or request activation.',
  COMPANY_SUSPENDED: LAUNCH.companySuspended,
  ACCOUNT_SUSPENDED: LAUNCH.accountSuspended,
  SESSION_REVOKED: LAUNCH.sessionRevoked,
  ACTIVATION_NOT_AVAILABLE: 'Activation can be requested during or after a free trial, or after a plan has ended.',
  COMPANY_NOT_SUBMITTABLE: 'This company cannot be submitted for approval now. If its trial or plan has ended, request activation instead.',
  INVALID_PLAN: 'Choose one of the plans on offer, or "Not sure".',
  // ── Demo booking ──
  DEMO_SLOT_TAKEN: 'That time was just taken. Please choose another.',
  DEMO_INVALID_SLOT: 'Choose one of the times offered.',
  DEMO_INVALID_PHONE: 'Enter a valid Pakistani mobile number, e.g. 0300 1234567.',
  DEMO_INVALID_EMAIL: 'Enter a valid email address.',
  DEMO_CONSENT_REQUIRED: 'Please agree to be contacted about your demo.',
  DEMO_FORM_EXPIRED: 'This form has expired. Reload the page and try again.',
  DEMO_VERIFICATION_FAILED: 'Please complete the verification and try again.',
  DEMO_BOOKING_DISABLED: 'Demo booking is not available right now.',
};

/** Fill `{name}` placeholders. */
export const fill = (s: string, vars: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
