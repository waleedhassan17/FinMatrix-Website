import { Font } from '@react-pdf/renderer';
import roboto400 from '@fontsource/roboto/files/roboto-latin-400-normal.woff?url';
import roboto500 from '@fontsource/roboto/files/roboto-latin-500-normal.woff?url';
import roboto700 from '@fontsource/roboto/files/roboto-latin-700-normal.woff?url';

import { typography } from '@/theme/tokens';

/** The app's typeface, embedded so a PDF looks the same on every machine. */
export const PDF_FONT_FAMILY = 'Roboto';

let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: roboto400, fontWeight: typography.bodySm.fontWeight },
      { src: roboto500, fontWeight: typography.labelSm.fontWeight },
      { src: roboto700, fontWeight: typography.h3.fontWeight },
    ],
  });
  // Never hyphenate: a split invoice number or customer name reads as a typo.
  Font.registerHyphenationCallback((word) => [word]);
}
