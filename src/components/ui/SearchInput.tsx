import { Search, X } from 'lucide-react';
import {
  forwardRef,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type' | 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  /** `sm` is the 40px toolbar field, `md` the 48px form-height field. */
  size?: 'sm' | 'md';
  /** `bare` drops the border and fill, for a field inside a popover. */
  tone?: 'surface' | 'background' | 'bare';
  label?: ReactNode;
  /** Shown at the right edge while the field is empty, e.g. a shortcut key. */
  shortcutHint?: ReactNode;
  containerClassName?: string;
}

/**
 * The one search field.
 *
 * It replaces fifteen hand-copied `<Search/> + <input>` pairs whose left padding
 * had drifted between 24, 34 and 38px. At 24px the text started underneath the
 * 16px icon sitting 12px in, which is the overlap people saw. The geometry now
 * lives here once: 12px inset, 16px icon, 12px gap — text starts at 40px.
 *
 * The browser's own cancel button is hidden and replaced with a real clear
 * button, so every browser gets one, and it looks like the rest of the app.
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    onValueChange,
    size = 'sm',
    tone = 'surface',
    label,
    shortcutHint,
    containerClassName,
    className,
    id,
    disabled,
    ...props
  },
  forwardedRef,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const innerRef = useRef<HTMLInputElement | null>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    innerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  const hasValue = value.length > 0;

  const field = (
    <div className={cn('relative', !label && containerClassName)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-sm size-4 -translate-y-1/2 text-text-tertiary"
      />
      <input
        ref={setRefs}
        id={inputId}
        type="search"
        value={value}
        disabled={disabled}
        onChange={(e) => onValueChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        className={cn(
          'w-full rounded-md pr-[36px] pl-[40px] text-text-primary outline-none transition-colors',
          'placeholder:text-text-tertiary',
          '[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none',
          size === 'sm' ? 'h-10 text-body-sm' : 'h-12 text-body-md',
          tone === 'surface' && 'border border-border bg-surface focus:border-[1.5px] focus:border-primary',
          tone === 'background' &&
            'border border-border bg-background focus:border-[1.5px] focus:border-primary focus:bg-surface',
          tone === 'bare' && 'bg-transparent',
          disabled && 'opacity-70',
          className,
        )}
        {...props}
      />
      {hasValue && !disabled ? (
        <button
          type="button"
          aria-label="Clear search"
          // Keep focus in the field: a mousedown on the button would blur it first.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onValueChange('');
            innerRef.current?.focus();
          }}
          className="absolute top-1/2 right-xs flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      ) : (
        shortcutHint && (
          <span className="pointer-events-none absolute top-1/2 right-sm -translate-y-1/2">
            {shortcutHint}
          </span>
        )
      )}
    </div>
  );

  if (!label) return field;

  return (
    <div className={cn('flex flex-col gap-xxs', containerClassName)}>
      <label htmlFor={inputId} className="text-label-md text-text-secondary">
        {label}
      </label>
      {field}
    </div>
  );
});

export default SearchInput;
