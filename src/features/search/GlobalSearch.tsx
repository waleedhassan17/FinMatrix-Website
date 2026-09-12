import * as Popover from '@radix-ui/react-popover';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  FileText,
  Loader2,
  Package,
  Receipt,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { SearchInput } from '@/components/ui/SearchInput';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/cn';
import {
  MIN_SEARCH_LENGTH,
  SEARCH_KIND_LABEL,
  groupHits,
  visibleHits,
  type SearchHit,
  type SearchKind,
} from '@/models/search';
import { searchAll } from '@/networks/search/searchNetwork';
import { selectFeatures, selectRole } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  invoices: FileText,
  bills: Receipt,
  customers: Users,
  vendors: Store,
  inventory: Package,
};

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

interface GlobalSearchProps {
  /** Listen for `/` and Ctrl/⌘+K. Only the always-mounted instance should. */
  shortcut?: boolean;
  autoFocus?: boolean;
  /** After a result is opened — the phone row closes itself. */
  onNavigate?: () => void;
  /** Escape in an empty field — the phone row closes itself. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Search across customers, vendors, invoices, bills and inventory from the top
 * bar, backed by `GET /search`.
 *
 * A combobox in the ARIA sense: focus stays in the field while ↑/↓ move through
 * the results, Enter opens one and Escape closes the panel. Hits this role
 * cannot open are left out rather than shown and then bounced.
 */
export function GlobalSearch({
  shortcut = false,
  autoFocus = false,
  onNavigate,
  onDismiss,
  className,
}: GlobalSearchProps) {
  const navigate = useNavigate();
  const role = useAppSelector(selectRole);
  const features = useAppSelector(selectFeatures);

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const typed = input.trim();
  const term = useDebouncedValue(typed, 250);
  const ready = term.length >= MIN_SEARCH_LENGTH;

  const query = useQuery({
    queryKey: ['search', term],
    queryFn: ({ signal }) => searchAll(term, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: 1,
  });

  // Only show hits once the field is long enough; placeholderData would
  // otherwise keep the previous search's rows on screen after it was cleared.
  const groups = useMemo(
    () =>
      typed.length >= MIN_SEARCH_LENGTH && query.data
        ? groupHits(visibleHits(query.data, role, features))
        : [],
    [typed, query.data, role, features],
  );
  const flat = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
  const optionId = (i: number) => `${listId}-option-${i}`;

  const settled = term === typed && !query.isFetching;

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // optionId is derived from listId, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: KeyboardEvent) => {
      const combo = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !isTypingTarget(e.target);
      if (!combo && !slash) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcut]);

  const openHit = (hit: SearchHit) => {
    navigate(hit.to);
    setInput('');
    setOpen(false);
    setActive(0);
    inputRef.current?.blur();
    onNavigate?.();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (typed) setOpen(true);
        if (flat.length === 0) return;
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((activeIndex + step + flat.length) % flat.length);
        return;
      }
      case 'Enter':
        if (open && activeIndex >= 0) {
          e.preventDefault();
          openHit(flat[activeIndex]);
        }
        return;
      case 'Escape':
        e.preventDefault();
        if (open) setOpen(false);
        else if (input) setInput('');
        else {
          inputRef.current?.blur();
          onDismiss?.();
        }
        return;
    }
  };

  const panelOpen = open && typed.length > 0;

  return (
    <Popover.Root open={panelOpen} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div ref={anchorRef} className={cn('w-full', className)}>
          <SearchInput
            ref={inputRef}
            value={input}
            onValueChange={(v) => {
              setInput(v);
              setActive(0);
              setOpen(v.trim().length > 0);
            }}
            onFocus={() => typed && setOpen(true)}
            onKeyDown={onKeyDown}
            tone="background"
            placeholder="Search customers, invoices, bills…"
            aria-label="Search customers, vendors, invoices, bills and inventory"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={panelOpen}
            aria-controls={listId}
            aria-activedescendant={panelOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            shortcutHint={
              shortcut ? (
                <kbd className="hidden rounded-sm border border-border bg-surface px-xxs font-sans text-caption text-text-tertiary lg:inline-block">
                  {isMac ? '⌘K' : 'Ctrl K'}
                </kbd>
              ) : undefined
            }
          />
        </div>
      </Popover.Anchor>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          // Focus stays in the field; the panel is driven from the keyboard there.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // A click back into the field is not "outside".
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-surface shadow-md"
        >
          <div id={listId} role="listbox" aria-label="Search results" className="max-h-[min(28rem,70vh)] overflow-y-auto p-xxs">
            {typed.length < MIN_SEARCH_LENGTH ? (
              <p className="px-sm py-md text-body-sm text-text-tertiary">
                Keep typing — search starts at {MIN_SEARCH_LENGTH} characters.
              </p>
            ) : query.isError && settled ? (
              <div className="flex items-center justify-between gap-md px-sm py-md">
                <p className="text-body-sm text-danger">Search is unavailable right now.</p>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => query.refetch()}
                  className="text-label-md text-primary hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : flat.length === 0 ? (
              settled && query.isSuccess ? (
                <p className="px-sm py-md text-body-sm text-text-tertiary">
                  No matches for &ldquo;{typed}&rdquo;.
                </p>
              ) : (
                <p className="flex items-center gap-xs px-sm py-md text-body-sm text-text-tertiary">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Searching…
                </p>
              )
            ) : (
              groups.map((group) => {
                const Icon = KIND_ICON[group.kind];
                return (
                  <div key={group.kind} role="group" aria-label={SEARCH_KIND_LABEL[group.kind]} className="py-xxs">
                    <p className="flex items-center justify-between px-sm pt-xs pb-xxs text-overline text-text-tertiary">
                      {SEARCH_KIND_LABEL[group.kind]}
                      {!settled && group === groups[0] && (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      )}
                    </p>
                    {group.hits.map((hit) => {
                      const i = flat.indexOf(hit);
                      const selected = i === activeIndex;
                      return (
                        <div
                          key={hit.id}
                          id={optionId(i)}
                          role="option"
                          aria-selected={selected}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => openHit(hit)}
                          onMouseMove={() => i !== activeIndex && setActive(i)}
                          className={cn(
                            'flex cursor-pointer items-center gap-sm rounded-md px-sm py-xs',
                            selected && 'bg-primary-tint',
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-text-secondary">
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-label-md text-text-primary">{hit.title}</span>
                            {hit.subtitle && (
                              <span className="block truncate text-caption text-text-secondary">{hit.subtitle}</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          <div className="hidden items-center gap-md border-t border-border-light bg-background px-sm py-xs text-caption text-text-tertiary sm:flex">
            <span>↑ ↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export default GlobalSearch;
