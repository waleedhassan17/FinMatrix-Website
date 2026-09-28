import { Text, View } from '@react-pdf/renderer';

import {
  PdfFile,
  PdfNotes,
  PdfPartyAndMeta,
  PdfSheet,
  PdfSignatures,
  PdfTable,
  PdfTotals,
} from '@/features/pdf/components';
import { pdfStyles } from '@/features/pdf/pdfTheme';
import { reportCellText, type ReportPdfData } from '@/features/reports/reportPdfTable';

/** Any report or statement on company letterhead: title, period, basis, then its tables. */
export function ReportPdf({ data, generatedAt }: { data: ReportPdfData; generatedAt: string }) {
  const subtitle = [data.periodLabel, data.basis].filter(Boolean).join(' · ');
  const totals = data.totals && data.totals.length > 0 ? <PdfTotals totals={data.totals} /> : null;
  const totalsAfter = Math.min(data.totalsAfter ?? data.sections.length - 1, data.sections.length - 1);

  return (
    <PdfFile title={`${data.title} — ${data.periodLabel}`} author={data.company.name}>
      <PdfSheet company={data.company} kind={data.title} subtitle={subtitle} generatedAt={generatedAt}>
        {data.party || (data.meta && data.meta.length > 0) ? (
          <PdfPartyAndMeta party={data.party ?? null} meta={data.meta ?? []} />
        ) : null}

        {data.sections.map((section, i) => (
          <View key={i}>
            {section.title ? (
              <Text style={[pdfStyles.overline, { marginBottom: 5, marginTop: i > 0 ? 4 : 0 }]}>
                {section.title}
              </Text>
            ) : null}
            <PdfTable
              columns={section.columns.map((c) => ({ header: c.header, align: c.align, flex: c.flex ?? 1 }))}
              rows={section.rows.map((r) => ({ ...r, cells: r.cells.map(reportCellText) }))}
            />
            {i === totalsAfter ? totals : null}
          </View>
        ))}
        {data.sections.length === 0 ? totals : null}

        {data.notes ? <PdfNotes notes={data.notes} /> : null}
        {data.signatures ? <PdfSignatures labels={data.signatures} /> : null}
      </PdfSheet>
    </PdfFile>
  );
}

export default ReportPdf;
