import { useSyncExternalStore } from 'react';

import { documentGate, type DocumentGate } from '@/config/migrationGuides';
import { useFeature } from '@/hooks/useCapability';
import type { MigrationBatch } from '@/models/migration';

// The owner's "we have no stock to bring in", per batch. A convenience kept in
// this browser: the server's checks still refuse stock on the trial balance
// with no stock report behind it.
const listeners = new Set<() => void>();
const storageKey = (batchId: string) => `fm-migration-no-stock:${batchId}`;

function readNoStock(batchId: string): boolean {
  try {
    return localStorage.getItem(storageKey(batchId)) === '1';
  } catch {
    return false;
  }
}

function writeNoStock(batchId: string, value: boolean) {
  try {
    if (value) localStorage.setItem(storageKey(batchId), '1');
    else localStorage.removeItem(storageKey(batchId));
  } catch {
    // Storage unavailable: the answer lasts until the page reloads.
    memory.set(batchId, value);
  }
  listeners.forEach((l) => l());
}

const memory = new Map<string, boolean>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export interface DocumentGateState extends DocumentGate {
  keepsStock: boolean;
  noStock: boolean;
  setNoStock: (value: boolean) => void;
}

/** Which required documents are still missing for this batch (see documentGate). */
export function useDocumentGate(batch: MigrationBatch | undefined): DocumentGateState {
  const keepsStock = useFeature('inventory');
  const id = batch?.id ?? '';
  const noStock = useSyncExternalStore(subscribe, () => memory.get(id) ?? readNoStock(id), () => false);
  const gate = batch
    ? documentGate(batch.sourceSystem, batch.files ?? [], { keepsStock, noStock })
    : { missing: [], stockMissing: [], unplaced: [], complete: true };
  return { ...gate, keepsStock, noStock, setNoStock: (v) => writeNoStock(id, v) };
}
