// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { InsightsList } from '@/features/reports/InsightsList';

describe('InsightsList', () => {
  it('says each finding with a spoken tone and a link to the report behind it', () => {
    render(
      <MemoryRouter>
        <InsightsList
          insights={[
            {
              key: 'collections',
              tone: 'negative',
              title: 'Customers take 93 days to pay',
              detail: 'The aging report shows who to chase first.',
              report: { key: 'arAging', params: {} },
            },
            {
              key: 'unknown',
              tone: 'neutral',
              title: 'Something new',
              detail: 'From a newer server.',
              report: { key: 'notAReport', params: {} },
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('img', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customers take 93 days to pay — open AR Aging' })).toHaveAttribute(
      'href',
      '/reports/ar-aging',
    );
    // A report this client does not have: the finding stands, unlinked.
    expect(screen.getByText('Something new')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('says when nothing stands out', () => {
    render(<InsightsList insights={[]} />);
    expect(screen.getByText('Nothing unusual in this period.')).toBeInTheDocument();
  });
});
