// ═══════════════════════════════════════════════════════
// FinMatrix Web — Store
// ═══════════════════════════════════════════════════════
// Deliberately small. The app carries ~110 reducers because React Native gave
// it no server-cache layer and every screen hand-rolled its own loading state.
// Here TanStack Query owns server state, so Redux holds identity and nothing
// else.
//
// No redux-persist. The app persists its auth slice; we do not, because the
// access token in localStorage IS the persistence and /auth/me is the source of
// truth for everything derived from it. Persisting role and companyStatus would
// mean a demoted or suspended user keeps the old navigation until the next
// fetch lands — the exact window an approvals-gated product cannot afford.
// Boot reads the token, calls /auth/me, and fills the slice.

import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';

import authReducer from './authSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
