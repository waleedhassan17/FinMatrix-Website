// ═══════════════════════════════════════════════════════
// BILLING-DISABLED BUILD  (free trial + subscriptions)
// ═══════════════════════════════════════════════════════
// FinMatrix is going to warehouses for a testing phase, and for that phase
// the site has exactly ONE acquisition path:
//
//   signup → company setup → auto-submit → super-admin approval → full app
//
// No plan selection, no free trial, no bank-transfer payment step, no
// paywall, and nothing on the public landing page that promises any of them.
//
// Nothing is deleted. PlanSelectPage, PaySubscriptionPage,
// RenewSubscriptionPage, TrialStrip, PricingSection, features/billing/* and
// networks/billing/* all stay exactly where they are.
//
// ⚠️ IMPORTANT for anyone editing the commented-out code: `npm run build` is
// `tsc -b`, tsconfig.app.json has `"include": ["src"]`, and noUnusedLocals /
// noUnusedParameters are both on. That means:
//   • every unreferenced file under src/ is STILL type-checked, so the three
//     kept pages must keep compiling — do not comment exports out of
//     features/billing/* or networks/billing/*, and do not narrow
//     OnboardingShell's `step` prop (those pages still pass 2 and 3);
//   • any commented-out JSX must have its imports and locals commented in the
//     same edit, or the build fails on an unused symbol.
//
// To restore Free Trial + Subscriptions:
//   1. set BILLING_DISABLED_BUILD = false in all THREE repos
//        FinMatrix-Web      src/config/featureFlags.ts   (this file)
//        FinMatrix          src/utils/featureGates.ts
//        FinMatrix-Backend  src/common/feature-flags.ts
//   2. grep this repo for "BILLING-DISABLED" and un-comment the marked blocks:
//        app/router.tsx + app/lazyPages.ts — the three route entries
//        features/shell/AppLayout.tsx      — the TrialStrip
//        pages/account/MyAccountPage.tsx   — the PlanDetails block + shortcut
//        pages/onboarding/CompanySetupPage.tsx — the submit hop
//        pages/auth/AccountStatusPage.tsx  — the draft branch's action
//        features/onboarding/OnboardingShell.tsx — the 3-step rail
//        pages/LandingPage.tsx + features/landing/* — pricing, CTAs, FAQ
//        pages/deliveries/RiderFormPage.tsx — the "Change plan" link
//        features/landing/__tests__/landingHonesty.test.tsx
//        app/__tests__/publicRoutes.test.ts
//
// EXISTING paying companies are left alone: the server keeps every plan key,
// keeps running the expiry cron, and keeps a paid company's limits and
// renewal date. Only the ACQUISITION path is short-circuited.
export const BILLING_DISABLED_BUILD = true;
