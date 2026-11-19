import { ChevronDown, Download, FileText, MessageCircle, Printer, Sheet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { generatedStamp, reportPdfBlob } from '@/features/documents/documentPdf';
import type { DocCompany } from '@/features/documents/documentModel';
import { downloadBlob, printBlob } from '@/features/pdf/renderPdf';
import type { ReportSection } from '@/features/reports/reportPdfTable';

/**
 * Every way the day leaves the screen, behind one button: a spreadsheet, a
 * PDF on letterhead, a printout, and a short summary for WhatsApp. Five
 * loose buttons in the header said "toolbar"; one menu says "report".
 */
export function ExportMenu({
  title,
  periodLabel,
  basis,
  company,
  disabled,
  onCsv,
  sections,
  filename,
  onWhatsApp,
}: {
  title: string;
  periodLabel: string;
  basis?: string;
  company: DocCompany;
  disabled: boolean;
  /** Builds and saves the CSV (it may fetch every page first); the file's name. */
  onCsv: () => Promise<string | undefined>;
  /** The PDF's tables (they may fetch every page first). */
  sections: () => Promise<ReportSection[]>;
  filename: string;
  onWhatsApp: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const pdf = async () =>
    reportPdfBlob({
      title,
      periodLabel,
      basis,
      company,
      meta: [
        { label: 'Day', value: periodLabel },
        ...(basis ? [{ label: 'Scope', value: basis }] : []),
        { label: 'Generated', value: generatedStamp() },
      ],
      sections: await sections(),
    });

  const run = async (what: 'pdf' | 'print') => {
    setBusy(true);
    try {
      const blob = await pdf();
      if (what === 'pdf') {
        downloadBlob(blob, `${filename}.pdf`);
        toast.success('PDF downloaded', { description: `${filename}.pdf` });
      } else {
        printBlob(blob);
      }
    } catch (e) {
      toast.error('Could not prepare the PDF', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const csv = async () => {
    setBusy(true);
    try {
      const name = await onCsv();
      if (name) toast.success('CSV downloaded', { description: name });
    } catch (e) {
      toast.error('Could not prepare the CSV', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled || busy}>
          <Download className="size-4" />
          {busy ? 'Preparing…' : 'Export'}
          <ChevronDown className="size-4 text-text-tertiary" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Download</DropdownMenuLabel>
        <DropdownMenuItem icon={<FileText />} onSelect={() => void run('pdf')}>
          PDF report
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Sheet />} onSelect={() => void csv()}>
          Spreadsheet (CSV)
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Printer />} onSelect={() => void run('print')}>
          Print
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Share</DropdownMenuLabel>
        <DropdownMenuItem icon={<MessageCircle />} onSelect={onWhatsApp}>
          Summary on WhatsApp
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ExportMenu;
