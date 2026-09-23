// ═══════════════════════════════════════════════════════
// FinMatrix Web — Global Design System (THEME)
// ═══════════════════════════════════════════════════════
// Ported verbatim from the mobile app's src/theme/theme.ts. The two clients are
// used side by side by the same company, so a colour that disagrees between
// them is a bug, not a variation. Values here must not drift from the app.
//
// Three substitutions were required to leave React Native behind:
//   1. Platform.select(font) → a CSS font stack (see FONT_STACK).
//   2. shadows.* (shadowColor/Offset/Opacity/Radius/elevation) → box-shadow
//      strings, computed to the same visual result.
//   3. summaryPanel.gradient (a 2-stop array for expo-linear-gradient, drawn
//      start {0,0} → end {1,1}) → a 135° CSS linear-gradient.
//
// Deliberately NOT ported: the app's src/theme/index.ts, which re-exports a
// legacy Atlassian token set whose names collide with these at DIFFERENT values
// (spacing.lg 24 vs 20, radius.lg 16 vs 12, success #00875A vs #16A34A).
// This is a greenfield repo; it does not inherit that debt.

// ───────────────────────────────────────────────
// 1. Raw palette
// ───────────────────────────────────────────────
const palette = {
  // Neutral — cool slate ramp (the backbone of the UI)
  neutral25: '#FCFCFD',
  neutral50: '#F7F9FB',
  neutral100: '#EEF2F6',
  neutral200: '#E2E8F0',
  neutral300: '#CBD5E1',
  neutral400: '#94A3B8',
  neutral500: '#64748B',
  neutral600: '#475569',
  neutral700: '#334155',
  neutral800: '#1E293B',
  neutral900: '#0F172A',

  // Brand teal — the legacy link/focus tokens below, and the staff portal's
  // accent. The staff sign-in door is a different door from the owner's, and a
  // colour is the only thing that says so before the fields are read.
  teal700: '#0F766E',
  teal600: '#0E8C80',
  tealTint: '#E4F2F0',
  teal950: '#042F2C',

  // Navy ramp. navyTint is the only light step the app shipped, and the public
  // pages need the ones between it and navy600 — tinted bands, gradient stops,
  // and a floor dark enough for white text on the hero.
  navy50: '#F3F7FB',
  navy100: '#E3ECF5',
  navy200: '#C7D9E9',
  navy300: '#9DB9D4',
  // 400 and 500 close the gap between navy300 and navy600 so the ramp can be
  // sampled at any length for ORDERED data — see AGING_RAMP below. Added to
  // the app's theme.ts at the same values in the same change.
  navy400: '#6E93BC',
  navy500: '#3F6C9B',
  navyBright: '#24598A',
  navy800: '#12365A',
  navy900: '#0C2440',
  navy950: '#071726',

  // Secondary — violet (distinct, non-state categories)
  violet600: '#7C3AED',
  violetLight: '#EFE9FD',

  // Navy — the app's action colour. Deep and quiet rather than bright: it
  // paints every primary button, "New"/"Add" pill and form section dot.
  navy600: '#1F4E79',
  navy700: '#163A5C',
  navyTint: '#EAF0F6',

  // On-dark accents. The ramps below are tuned for white grounds and go muddy
  // on the near-black summary panel, so its accents are named separately.
  amber400: '#F59E0B',
  amber300: '#FBBF24',
  emerald400: '#34D399',
  red400: '#F87171',

  // Semantic — success / warning / danger / info
  green600: '#16A34A',
  greenLight: '#D8F3E1',
  greenLighter: '#EFFBF3',

  amber600: '#D97706',
  amberLight: '#FBEAD0',
  amberLighter: '#FDF6EA',

  red600: '#DC2626',
  redLight: '#FBDCDC',
  redLighter: '#FDF0F0',

  blue600: '#2563EB',
  blueLight: '#DCE7FE',
} as const;

// ───────────────────────────────────────────────
// 2. Semantic colour tokens
// ───────────────────────────────────────────────
// The app carries `actionGreen*` as aliases of `primary*` — both resolve to the
// same navy. They exist there only to avoid a ~420-site rename. Nothing here
// consumes them, so they are not reproduced: use `primary`. `success` is what
// carries the meaning "green" now.
export const colors = {
  primary: palette.navy600,
  primaryDark: palette.navy700,
  primaryLight: palette.navyTint,
  primaryLighter: palette.navyTint,
  primaryTint: palette.navyTint,

  // Secondary — a category colour for non-state grouping, never decoration.
  secondary: palette.violet600,
  secondaryLight: palette.violetLight,

  success: palette.green600,
  successLight: palette.greenLight,
  successLighter: palette.greenLighter,

  warning: palette.amber600,
  warningLight: palette.amberLight,
  warningLighter: palette.amberLighter,

  danger: palette.red600,
  dangerLight: palette.redLight,
  dangerLighter: palette.redLighter,

  info: palette.blue600,
  infoLight: palette.blueLight,

  // Sequential navy ramp, light → dark. For ORDERED data — see AGING_RAMP —
  // never for telling separate series apart.
  //
  // `primary50…primary950` further down aliases most of the same palette steps
  // under CSS-variable names that mirror index.css. They are NOT a second ramp
  // and they are not numbered the same way: that set's `primary600` is
  // navyBright, a step lighter than `primary` itself. These names match the
  // app's theme.ts one for one, which is what charts read.
  navy50: palette.navy50,
  navy100: palette.navy100,
  navy200: palette.navy200,
  navy300: palette.navy300,
  navy400: palette.navy400,
  navy500: palette.navy500,
  navy600: palette.navy600,
  navy700: palette.navy700,

  // Neutrals (exposed for direct use)
  neutral0: '#FFFFFF',
  neutral25: palette.neutral25,
  neutral50: palette.neutral50,
  neutral100: palette.neutral100,
  neutral200: palette.neutral200,
  neutral300: palette.neutral300,
  neutral400: palette.neutral400,
  neutral500: palette.neutral500,
  neutral600: palette.neutral600,
  neutral700: palette.neutral700,
  neutral800: palette.neutral800,
  neutral900: palette.neutral900,

  // Surfaces
  background: '#F4F6F9', // app canvas — faint cool tint, not pure white
  surface: '#FFFFFF', // cards / sheets
  surface2: '#F9FAFB', // recessed rows inside a card
  surfaceHover: '#FCFCFD',
  backgroundAlt: '#FCFCFD',

  // Hairlines. `border` is dark enough to actually read as an edge.
  border: '#D3DAE3',
  borderStrong: '#C1CAD5', // emphasised edge — a selected or filled control
  borderLight: '#EEF2F6', // subtle internal dividers

  overlay: 'rgba(15, 23, 42, 0.55)', // modal scrim
  overlayLight: 'rgba(15, 23, 42, 0.15)',

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textDisabled: '#CBD5E1',
  textInverse: '#FFFFFF',

  // ── Interaction states ──────────────────────────────────────────────
  // The app defines primaryHover as teal600 (#0E8C80) — a leftover from when
  // the brand was teal. On mobile it is inert (no hover), so the wrong value
  // never showed. On web hover is everywhere, and a navy button that hovers
  // teal is plainly broken, so primary hover resolves to primaryDark, which is
  // what the token comments call the "hover/pressed" navy.
  primaryHover: palette.navy700,
  successHover: '#15803D',
  dangerHover: '#B91C1C',
  warningHover: '#B45309',

  // Legacy teal tokens, preserved at their app values.
  borderFocus: palette.teal600,
  textLink: palette.teal700,

  // ── Staff portal accent ─────────────────────────────────────────────
  // Navy is the owner's colour: it paints every primary action in the product
  // an owner administers. The staff sign-in page is a separate door to a
  // separate surface, so it takes the brand teal instead. This is wayfinding,
  // not decoration — it is why a staff member can tell at a glance they are not
  // on the owner's screen, before reading a single label.
  accentTeal: palette.teal700,
  accentTealDark: '#0B5C56',
  accentTealTint: palette.tealTint,
  accentTeal950: palette.teal950,

  // ── Navy ramp, CSS-variable aliases ─────────────────────────────────
  // Mirrors --color-primary-50 … -950 in index.css. primaryLight/Lighter/Tint
  // above are all one value; these are the steps between it and primary.
  //
  // Same palette steps as navy50…navy700 above, under the names the stylesheet
  // uses. Note the numbering does NOT line up: primary600 is navyBright, which
  // is lighter than `primary` (navy600). Chart code should read the navy* names
  // instead, which agree with the app's.
  primary50: palette.navy50,
  primary100: palette.navy100,
  primary200: palette.navy200,
  primary300: palette.navy300,
  primary600: palette.navyBright,
  primary800: palette.navy800,
  primary900: palette.navy900,
  primary950: palette.navy950,

  // On-dark positive — the green SummaryPanel already uses on its dark ground.
  successBright: palette.emerald400,
} as const;

// ───────────────────────────────────────────────
// 3. Typography scale
// ───────────────────────────────────────────────
// The app resolves to 'Roboto' on Android and the system face elsewhere. Roboto
// is loaded via @fontsource/roboto so web matches Android, which is the build
// the users actually have.
export const FONT_STACK =
  "Roboto, Inter, system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * ROLE MAP — which token a given piece of UI takes.
 *
 * This is the reference every consistency pass works from. A style should name
 * a role, never a size and weight: `text-label-md`, not `text-[13px] font-semibold`.
 *
 *   Screen title (navy header)     h2 · neutral0
 *   Screen subtitle                bodySm · white @ 62%
 *   Section header                 form.sectionTitle (11px, uppercase, tracked)
 *   Card / row primary             labelLg · textPrimary
 *   Card / row secondary           bodySm · textSecondary
 *   KPI or stat value              h2 (h3 where space is tight)
 *   KPI or stat label              caption · textSecondary
 *   Money — row                    labelLg, right-aligned, tabular-nums
 *   Money — total                  h4, right-aligned, tabular-nums
 *   Status badge                   labelSm + statusStyle(status)
 *   Table head                     overline · textSecondary
 *   Table cell                     caption · textPrimary
 *   Field label                    labelMd · textSecondary
 *   Input / selected value         bodyMd · textPrimary
 *   Helper, hint, caption          caption · textTertiary
 *   Button label                   labelLg
 *
 * When a hardcoded pair has no exact role, take the nearest: the scale uses
 * 600/700 where hand-written styles often reach for 700/800, so some text
 * renders one weight lighter. That is the intended outcome of adopting it.
 */
export interface TypeRole {
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
  letterSpacing: number;
  textTransform?: 'uppercase';
}

export const typography = {
  // ── Marketing hero roles ────────────────────────────────
  // WEB LANDING PAGE ONLY, and the only roles that carry the display face
  // (--font-display / Instrument Sans, bound in src/index.css). The Android app
  // has no marketing surface, so it never renders these.
  //
  // Set at 600. Weight 800 at display size reads as a startup; institutional
  // software sets headlines at 500–600 and lets the size carry the emphasis.
  heroXl: { fontSize: 62, lineHeight: 68, fontWeight: 600, letterSpacing: -1.8 },
  heroLg: { fontSize: 48, lineHeight: 54, fontWeight: 600, letterSpacing: -1.2 },
  heroMd: { fontSize: 34, lineHeight: 40, fontWeight: 600, letterSpacing: -0.8 },

  // Marketing hero only. Nothing inside the product is set this large.
  // displayXl/displayLg dropped 800 → 600 with the hero roles above; both are
  // landing-page-only in the UI. displayMd keeps 800 — it is authenticated
  // product and shares its values with the Android build.
  displayXl: { fontSize: 56, lineHeight: 62, fontWeight: 600, letterSpacing: -1.4 },
  displayLg: { fontSize: 36, lineHeight: 44, fontWeight: 600, letterSpacing: -0.5 },
  displayMd: { fontSize: 32, lineHeight: 40, fontWeight: 800, letterSpacing: -0.5 },
  displaySm: { fontSize: 24, lineHeight: 30, fontWeight: 700, letterSpacing: -0.3 },

  h1: { fontSize: 28, lineHeight: 34, fontWeight: 800, letterSpacing: -0.4 },
  h2: { fontSize: 22, lineHeight: 28, fontWeight: 700, letterSpacing: -0.3 },
  h3: { fontSize: 19, lineHeight: 26, fontWeight: 700, letterSpacing: -0.2 },
  h4: { fontSize: 16, lineHeight: 22, fontWeight: 600, letterSpacing: -0.1 },
  h5: { fontSize: 14, lineHeight: 20, fontWeight: 600, letterSpacing: 0 },

  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: 400, letterSpacing: 0 },
  bodyMd: { fontSize: 15, lineHeight: 22, fontWeight: 400, letterSpacing: 0 },
  bodySm: { fontSize: 13, lineHeight: 19, fontWeight: 400, letterSpacing: 0 },

  labelLg: { fontSize: 15, lineHeight: 20, fontWeight: 600, letterSpacing: 0 },
  labelMd: { fontSize: 13, lineHeight: 18, fontWeight: 600, letterSpacing: 0.1 },
  labelSm: { fontSize: 12, lineHeight: 16, fontWeight: 500, letterSpacing: 0.1 },

  caption: { fontSize: 12, lineHeight: 16, fontWeight: 400, letterSpacing: 0.1 },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: 600,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TypeRole>;

export type TypeRoleName = keyof typeof typography;

// ───────────────────────────────────────────────
// 4. Shape (radii), in px
// ───────────────────────────────────────────────
export const radius = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 999,
} as const;

// ───────────────────────────────────────────────
// 5. Elevation (soft, layered, cool)
// ───────────────────────────────────────────────
// RN's {offset, opacity, radius} maps to CSS as
// `0 <offsetY>px <shadowRadius>px rgba(<shadowColor>, <opacity>)`.
export const shadows = {
  /**
   * THE card elevation. One subtle shadow, used everywhere a surface lifts off
   * the canvas. The scale below still exists for parity with the app, but
   * nothing needs a 28 or 38px blur, and stacking several depths is most of
   * what makes an interface look synthetic.
   */
  card: '0 2px 8px rgba(16, 24, 40, 0.06)',
  xs: '0 1px 2px rgba(15, 23, 42, 0.04)',
  sm: '0 2px 8px rgba(15, 23, 42, 0.06)',
  md: '0 6px 18px rgba(15, 23, 42, 0.09)',
  lg: '0 12px 28px rgba(15, 23, 42, 0.12)',
  xl: '0 20px 38px rgba(15, 23, 42, 0.16)',
} as const;

// ───────────────────────────────────────────────
// 6. Spacing, in px
// ───────────────────────────────────────────────
// Note: not a strict 4px grid — 12 and 20 are deliberate. Preserved as-is so
// web and mobile lay out identically.
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  xxxxl: 48,
} as const;

// ───────────────────────────────────────────────
// 7. Form-control tokens
// ───────────────────────────────────────────────
// THE single source for form-control metrics. Every form primitive reads
// these — components must not hardcode control heights, radii, or the Add-pill.
export const form = {
  /** Height of every single-line text input, select trigger, date field. */
  controlHeight: 48,
  /** Corner radius of every form control. */
  controlRadius: 10,
  /** Spec of the "Add" pill — identical everywhere it appears. */
  addPill: {
    background: colors.primary,
    radius: 20,
    paddingX: 14,
    paddingY: 8,
    fontSize: 13,
    fontWeight: 700,
    iconSize: 15,
  },
  /** Section header: dot + 11px uppercase letter-spaced title. */
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: colors.neutral500,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  sectionDot: { size: 8, color: colors.primary },
  /**
   * The dark "summary / totals" panel that closes every transaction form.
   * In the app this spec is inlined in five separate forms; on web it is
   * rendered once by <SummaryPanel>.
   */
  summaryPanel: {
    /** RN drew this start {0,0} → end {1,1}, i.e. 135deg in CSS. */
    gradient: `linear-gradient(135deg, ${palette.neutral900}, ${palette.neutral800})`,
    /** Figures and headings on the panel. */
    text: palette.neutral100,
    /** Row labels — deliberately dimmer than the values beside them. */
    label: 'rgba(238, 242, 246, 0.65)',
    /** Hairline rule between rows. */
    divider: 'rgba(238, 242, 246, 0.14)',
    /** The "gold" accent: panel icon and grand total. */
    accent: palette.amber400,
    /** A credit or discount — money coming back off the total. */
    positive: palette.emerald400,
    /** A figure that needs attention: overdrawn account, unapplied amount. */
    caution: palette.amber300,
    /** A figure that is outright wrong — an overpayment with nowhere to go. */
    negative: palette.red400,
  },
} as const;

// ───────────────────────────────────────────────
// 8. Header
// ───────────────────────────────────────────────
/**
 * THE header colour — one flat dark navy, identical to the app's auth header.
 * The app keeps HEADER_NAVY as a 2-stop array of the same value purely so
 * existing LinearGradient calls still compile; on web that indirection is
 * pointless, so this is a plain colour.
 */
export const HEADER_BG = '#111D28';
export const HEADER_RADIUS = 26;

/**
 * The sidebar gradient. This one is genuinely a gradient and comes from the
 * web reference rather than the app (the app has no sidebar) — but both stops
 * sit in the same navy family as HEADER_BG and primary, so it reads as one
 * product.
 */
export const SIDEBAR_GRADIENT = 'linear-gradient(to bottom, #1A365D, #0F2544)';

// ───────────────────────────────────────────────
// 9. Chart series
// ───────────────────────────────────────────────
// Ported from ACCENT/CHART_SERIES in the app's components/reports/ReportUI.tsx
// so a revenue line is the same colour in both clients.
export const CHART_SERIES = [
  colors.primary,
  colors.info,
  colors.secondary,
  palette.amber400,
  colors.success,
] as const;

/**
 * Sequential ramp for ORDERED data, light → dark.
 *
 * CHART_SERIES is categorical: five hues chosen to be told APART, for series
 * that have an identity. Aging buckets do not — they have an ORDER, and
 * swapping "1–30" with "61–90" would change the meaning — so age is encoded as
 * lightness and reads off the chart without consulting a legend. It also has to
 * scale: the aging report now runs from five buckets to fourteen, where five
 * fixed hues would repeat and imply differences between buckets that are not
 * there.
 *
 * Six steps starting at navy200. The two palest are left out on purpose:
 * against a white card navy50 and navy100 read as an EMPTY column rather than a
 * small one.
 *
 * Verified monotonic in OKLCH lightness (0.877 → 0.341) and hue-stable
 * (245–252°), which is the correct check for a ramp. Running the CATEGORICAL
 * contrast validator over these fails by design — adjacent steps of a ramp are
 * meant to sit close.
 *
 * Identical to AGING_RAMP in the app's theme.ts.
 */
export const AGING_RAMP = [
  palette.navy200,
  palette.navy300,
  palette.navy400,
  palette.navy500,
  palette.navy600,
  palette.navy700,
] as const;

/**
 * `count` colours spread evenly across a ramp, always including both ends.
 *
 * Fewer buckets than steps takes a subset; more repeats intermediate steps
 * rather than inventing new ones — a generated hue would not be a step of this
 * ramp and would break the monotonicity that makes the order readable.
 */
export const rampSteps = (
  count: number,
  ramp: readonly string[] = AGING_RAMP,
): string[] => {
  if (count <= 0) return [];
  if (count === 1) return [ramp[ramp.length - 1]];
  return Array.from({ length: count }, (_, i) =>
    ramp[Math.round((i * (ramp.length - 1)) / (count - 1))],
  );
};

// ───────────────────────────────────────────────
// 10. Public theme object
// ───────────────────────────────────────────────
export const THEME = {
  colors,
  typography,
  radius,
  shadows,
  spacing,
  form,
} as const;

export type Theme = typeof THEME;

export default THEME;
