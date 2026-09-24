import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { authSignOut } from '@/networks/auth/authNetwork';
import { markIntentionalSignOut } from '@/utils/authEvents';
import { signOut as signOutAction } from '@/store/authSlice';
import { useAppDispatch } from '@/store/store';

/**
 * Ported from the app's src/hooks/useSignOut.ts, where the ordering is the
 * whole point.
 *
 * The server call is fire-and-forget and the local clear is what the UI waits
 * on: a user who clicked "sign out" must end up signed out even when the
 * network is down. `inFlight` blocks the double-click that would otherwise
 * fire two requests and race the redirect.
 *
 * The Query cache is cleared as well as the store. Without that, the next user
 * to sign in on this machine briefly sees the previous one's data — every list
 * renders from cache before its refetch lands.
 */
export function useSignOut() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const inFlight = useRef(false);

  /**
   * Sign out and land on `to`. `signOut` below is this with '/login', kept
   * argument-free because it is wired straight into onClick, which would
   * otherwise hand it the click event as a destination.
   */
  const signOutTo = useCallback(
    (to: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setSigningOut(true);

      // Before the server call: requests still in flight on the old token must
      // not be refreshed or reported as an expired session (see authEvents).
      markIntentionalSignOut();

      // Not awaited on purpose — see above.
      void authSignOut();

      dispatch(signOutAction());
      queryClient.clear();
      navigate(to, { replace: true });

      inFlight.current = false;
      setSigningOut(false);
    },
    [dispatch, navigate, queryClient],
  );

  const signOut = useCallback(() => signOutTo('/login'), [signOutTo]);

  return { signOut, signOutTo, signingOut };
}

export default useSignOut;
