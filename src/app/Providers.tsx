import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from 'sonner';

import { queryClient } from '@/app/queryClient';
import { store } from '@/store/store';
import { colors, radius, shadows } from '@/theme/tokens';

/**
 * Everything the tree needs above the router.
 *
 * The Toaster is styled from tokens rather than left on sonner's defaults,
 * which are a light grey system that would be the one un-branded surface in
 * the product.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: colors.surface,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: `${radius.md}px`,
              boxShadow: shadows.md,
            },
          }}
        />
      </QueryClientProvider>
    </ReduxProvider>
  );
}

export default Providers;
