import { QueryClient } from '@tanstack/react-query';

/**
 * One client for the app.
 *
 * `staleTime: 30_000` — ERP lists do not change second to second, and without
 * it every navigation back to a list refetches, which on a 50-row invoice list
 * is a visible flash.
 *
 * `retry: 1` — the server's failures are mostly deliberate (403 on a capability,
 * 409 on an interrupted approval, 400 on validation). Retrying those three
 * times just delays the message the user needs to read. One retry still covers
 * a dropped connection.
 *
 * `refetchOnWindowFocus: false` — an accountant tabs away to a spreadsheet
 * constantly; refetching every return is noise, and on a half-filled form it
 * risks pulling data out from under them.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
