// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { KpiCard } from '@/features/reports/KpiCard';
import { kpiSerializer } from '@/serializers/kpiSerializer';
import { cockpitKpi, financialHealthV2 } from '@/test/msw/reportsV2Fixtures';

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('KpiCard', () => {
  it('prints the value in its unit and the formula with its inputs behind the ⓘ', async () => {
    wrap(<KpiCard kpi={kpiSerializer(financialHealthV2.kpis[1])} />);
    expect(screen.getByText('4.00×')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How current ratio is calculated' }));
    expect(await screen.findByText('Current assets ÷ Current liabilities')).toBeInTheDocument();
    expect(screen.getByText('Current assets')).toBeInTheDocument();
    expect(screen.getByText('Rs 1,200,000.00')).toBeInTheDocument();
  });

  it('says why a value is missing in its place, rather than printing zero or a dash', () => {
    wrap(<KpiCard kpi={kpiSerializer(financialHealthV2.kpis[4])} />);
    expect(screen.queryByText('—')).toBeNull();
    expect(screen.getByText('Cash-positive — no burn')).toHaveClass('text-h4');
  });

  it('tones the move by the KPI: a rising DSO is bad news', () => {
    wrap(<KpiCard kpi={kpiSerializer(cockpitKpi('dso'))} />);
    expect(screen.getByText('+4 days')).toHaveClass('text-danger');
    expect(screen.getByLabelText('DSO, 42 days, up 4 days, Healthy')).toBeInTheDocument();
  });

  it('wears the server’s verdict as a word and an icon, and quotes its rule of thumb', async () => {
    wrap(<KpiCard kpi={kpiSerializer(financialHealthV2.kpis[1])} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    // The figures it was judged on, under the value.
    expect(screen.getByText('Rs 1.2M current assets · Rs 300K current liabilities')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How current ratio is calculated' }));
    expect(await screen.findByText(/Above 1\.5× is generally comfortable/)).toBeInTheDocument();
  });

  it('shows no pill for a figure with no rule of thumb, and none from an older server', () => {
    const { rerender } = wrap(<KpiCard kpi={kpiSerializer(cockpitKpi('revenue'))} />);
    expect(screen.queryByText(/Healthy|Watch|At risk/)).toBeNull();
    const { assessment: _ignored, ...old } = financialHealthV2.kpis[1];
    rerender(
      <MemoryRouter>
        <KpiCard kpi={kpiSerializer(old)} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Healthy|Watch|At risk/)).toBeNull();
  });

  it('draws the month-by-month shape when given one', () => {
    wrap(<KpiCard kpi={kpiSerializer(cockpitKpi('revenue'))} trend={[100000, 120000]} />);
    expect(screen.getByRole('img', { name: 'Revenue by month' })).toBeInTheDocument();
  });

  it('fills the move from a separately fetched prior only when the KPI has none', () => {
    wrap(<KpiCard kpi={kpiSerializer(financialHealthV2.kpis[0])} priorValue={800000} priorLabel="vs Aug 31" />);
    expect(screen.getByText('+Rs 100,000.00')).toHaveClass('text-success');
    expect(screen.getByText('vs Aug 31')).toBeInTheDocument();
  });

  it('links to its source report', () => {
    wrap(<KpiCard kpi={kpiSerializer(cockpitKpi('revenue'))} href="/reports/profit-loss?from=a&to=b" />);
    expect(screen.getByRole('link', { name: 'Open the report behind revenue' })).toHaveAttribute(
      'href',
      '/reports/profit-loss?from=a&to=b',
    );
  });
});
