import { useState } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import { SidePanel } from '@/components/ui/SidePanel';
import { AccountDetails } from '@/features/reports/investigate/AccountDetails';
import { CashFlowLineView } from '@/features/reports/investigate/CashFlowLineView';
import { MovementView } from '@/features/reports/investigate/MovementView';
import { useAccountRegister, type TieBasis } from '@/features/reports/investigate/register';
import { RegisterView } from '@/features/reports/investigate/RegisterView';
import { RetainedEarningsView } from '@/features/reports/investigate/RetainedEarningsView';
import type { ReportRange } from '@/models/reportPeriod';

/** An account line on a statement. */
export interface AccountSubject {
  kind: 'account';
  accountCode: string;
  accountName: string;
  /** The figure on the line, to tie the register to. */
  lineAmount: number | null;
  basis: TieBasis;
  /** The register's window. */
  range: ReportRange;
  /** Present only while a comparison is on: what the "What changed" tab explains. */
  movement?: { range: ReportRange; compare: ReportRange | null; caption: string } | null;
  statementGroup?: string;
  flags?: string[];
  /** One line under the title: "Balance Sheet · As of Mar 31, 2026". */
  context?: string;
}

/** A cash-flow line, opened by its `lineKey`. */
export interface CashFlowLineSubject {
  kind: 'cashFlowLine';
  lineKey: string;
  label: string;
  lineAmount: number;
  range: ReportRange;
  context?: string;
}

/** The balance sheet's Retained Earnings line: a rollforward, then 3100's register. */
export interface RetainedEarningsSubject {
  kind: 'retainedEarnings';
  asOfDate: string;
  lineAmount: number;
  /** 3100, when the account exists, with the posted balance its register ties to. */
  posted?: { accountCode: string; accountName: string; amount: number; range: ReportRange } | null;
  context?: string;
}

export type InvestigateSubject = AccountSubject | CashFlowLineSubject | RetainedEarningsSubject;

export interface InvestigatePanelProps {
  /** What is open; null closes the panel. */
  subject: InvestigateSubject | null;
  onClose: () => void;
  /**
   * The `data-row-key` of the row the panel belongs to. Focus returns to it on
   * close — including when the panel was opened by a link or by Back, when
   * there was no row to remember.
   */
  focusKey?: string | null;
}

const subjectTitle = (s: InvestigateSubject): string => {
  if (s.kind === 'account') return `${s.accountCode} ${s.accountName}`.trim();
  if (s.kind === 'cashFlowLine') return s.label;
  return 'Retained Earnings';
};

/**
 * The working paper behind a statement line, in a panel over the statement.
 *
 * An account opens on its Register; with a comparison on, "What changed"
 * breaks the move down by counterparty and document type; Details says what
 * the account is and explains any flag. A cash-flow line opens the cash rows
 * classified into it. Retained Earnings opens its rollforward.
 *
 * The panel is a dialog (SidePanel on Radix): focus is trapped inside while
 * it is open and returns to the row that opened it when it closes.
 */
export function InvestigatePanel({ subject, onClose, focusKey }: InvestigatePanelProps) {
  // The last subject stays mounted through the closing animation, so the
  // panel does not empty itself while it slides away; the last row key stays
  // so focus can go back to it.
  const [shown, setShown] = useState<InvestigateSubject | null>(subject);
  const [lastKey, setLastKey] = useState<string | null>(focusKey ?? null);
  // Adjusted during render, not in an effect: React's pattern for state that
  // follows a prop, with no extra paint of the stale value.
  if (subject && subject !== shown) setShown(subject);
  if (focusKey && focusKey !== lastKey) setLastKey(focusKey);
  const s = subject ?? shown;

  return (
    <SidePanel
      open={!!subject}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={s ? subjectTitle(s) : ''}
      description={s?.context}
      className="max-w-[46rem]"
      onCloseAutoFocus={(event) => {
        if (!lastKey) return;
        const row = document.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(lastKey)}"]`);
        if (row) {
          event.preventDefault();
          row.focus();
        }
      }}
    >
      {s?.kind === 'account' && <AccountTabs key={`${s.accountCode}|${s.range.startDate}|${s.range.endDate}`} subject={s} />}
      {s?.kind === 'cashFlowLine' && (
        <CashFlowLineView lineKey={s.lineKey} range={s.range} lineAmount={s.lineAmount} />
      )}
      {s?.kind === 'retainedEarnings' && <RetainedEarningsTabs subject={s} />}
    </SidePanel>
  );
}

function AccountTabs({ subject }: { subject: AccountSubject }) {
  const [tab, setTab] = useState('register');
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="px-lg">
        <TabsTrigger value="register">Register</TabsTrigger>
        {subject.movement && <TabsTrigger value="changes">What changed</TabsTrigger>}
        <TabsTrigger value="details">Details</TabsTrigger>
      </TabsList>
      <TabsContent value="register" className="pt-0">
        <RegisterView
          accountCode={subject.accountCode}
          range={subject.range}
          lineAmount={subject.lineAmount}
          basis={subject.basis}
        />
      </TabsContent>
      {subject.movement && (
        <TabsContent value="changes" className="pt-0">
          <MovementView
            accountCode={subject.accountCode}
            range={subject.movement.range}
            compare={subject.movement.compare}
            caption={subject.movement.caption}
          />
        </TabsContent>
      )}
      <TabsContent value="details" className="pt-0">
        <AccountDetailsTab subject={subject} />
      </TabsContent>
    </Tabs>
  );
}

/** Details reads the account's type from the register's first page — the same cached request. */
function AccountDetailsTab({ subject }: { subject: AccountSubject }) {
  const register = useAccountRegister(subject.accountCode, subject.range);
  const account = register.data?.pages[0]?.account;
  return (
    <AccountDetails
      accountCode={subject.accountCode}
      accountName={account?.accountName || subject.accountName}
      accountType={account?.accountType ?? ''}
      subType={account?.subType ?? ''}
      statementGroup={subject.statementGroup}
      flags={subject.flags}
    />
  );
}

function RetainedEarningsTabs({ subject }: { subject: RetainedEarningsSubject }) {
  const [tab, setTab] = useState('rollforward');
  if (!subject.posted) {
    return <RetainedEarningsView asOfDate={subject.asOfDate} lineAmount={subject.lineAmount} />;
  }
  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="px-lg">
        <TabsTrigger value="rollforward">Rollforward</TabsTrigger>
        <TabsTrigger value="register">Posted to {subject.posted.accountCode}</TabsTrigger>
      </TabsList>
      <TabsContent value="rollforward" className="pt-0">
        <RetainedEarningsView asOfDate={subject.asOfDate} lineAmount={subject.lineAmount} />
      </TabsContent>
      <TabsContent value="register" className="pt-0">
        <RegisterView
          accountCode={subject.posted.accountCode}
          range={subject.posted.range}
          lineAmount={subject.posted.amount}
          basis="closing"
        />
      </TabsContent>
    </Tabs>
  );
}

export default InvestigatePanel;
