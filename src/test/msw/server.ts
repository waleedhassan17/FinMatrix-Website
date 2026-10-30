import { setupServer } from 'msw/node';

import { reportsV2Handlers } from '@/test/msw/handlers';

/**
 * One MSW server for a test file. Call `startMsw()` at the top of the file:
 * it listens before the tests, resets per-test overrides after each, and
 * closes at the end. An unhandled request is an error — a page test must
 * never reach a real network.
 */
export const server = setupServer(...reportsV2Handlers);
