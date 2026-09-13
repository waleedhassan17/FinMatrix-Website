import { StyleSheet } from '@react-pdf/renderer';

import { PDF_FONT_FAMILY } from '@/features/pdf/fonts';
import { colors, typography, type TypeRoleName } from '@/theme/tokens';

/**
 * Paper takes the app's palette and type scale, not a second design system.
 *
 * Sizes are the screen roles scaled to points: an A4 page is read closer than a
 * monitor, and a 13px body role set at 13pt looks shouted on paper.
 */
const PT_PER_PX = 0.72;
const pt = (role: TypeRoleName): number =>
  Math.round(typography[role].fontSize * PT_PER_PX * 10) / 10;

export const pdfColor = {
  ink: colors.textPrimary,
  muted: colors.textSecondary,
  faint: colors.textTertiary,
  rule: colors.border,
  ruleLight: colors.borderLight,
  band: colors.surface2,
  brand: colors.primary,
  brandTint: colors.primaryTint,
  success: colors.success,
  danger: colors.danger,
  warning: colors.warning,
  paper: colors.neutral0,
} as const;

export const pdfSize = {
  title: pt('h1'),
  heading: pt('h3'),
  subheading: pt('h4'),
  body: pt('bodySm'),
  small: pt('caption'),
  tiny: pt('overline'),
  stamp: pt('displayLg') * 1.6,
} as const;

export const pdfWeight = {
  regular: typography.bodySm.fontWeight,
  medium: typography.labelSm.fontWeight,
  bold: typography.h3.fontWeight,
} as const;

export const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: pdfSize.body,
    fontWeight: pdfWeight.regular,
    color: pdfColor.ink,
    backgroundColor: pdfColor.paper,
    paddingTop: 44,
    paddingBottom: 64,
    paddingHorizontal: 42,
    // No page-wide lineHeight: @react-pdf resolves it to points where it is
    // declared and every child inherits that fixed height, so a 20pt title set
    // on a 12.7pt line overprinted the number beneath it.
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
    backgroundColor: pdfColor.brand,
  },
  footer: {
    position: 'absolute',
    left: 42,
    right: 42,
    bottom: 26,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.6,
    borderTopColor: pdfColor.ruleLight,
    paddingTop: 7,
    fontSize: pdfSize.tiny,
    color: pdfColor.faint,
  },
  row: { flexDirection: 'row' },
  spaceBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  overline: {
    fontSize: pdfSize.tiny,
    fontWeight: pdfWeight.bold,
    color: pdfColor.faint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  muted: { color: pdfColor.muted },
  faint: { color: pdfColor.faint },
  small: { fontSize: pdfSize.small },
  bold: { fontWeight: pdfWeight.bold },
  medium: { fontWeight: pdfWeight.medium },
  rule: { borderBottomWidth: 0.8, borderBottomColor: pdfColor.rule },
  ruleLight: { borderBottomWidth: 0.6, borderBottomColor: pdfColor.ruleLight },
});
