import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { downscaleImage } from '@/features/inventory/downscaleImage';
import { PHOTO_ACCEPT, photoFileError, type PhotoChange } from '@/features/inventory/itemPhoto';
import { ItemThumb } from '@/features/inventory/ItemThumb';

/**
 * The item form's photo. Nothing is uploaded here: the choice is held until
 * the item saves, because a new item has no id to attach a photo to before
 * then. The form applies it afterwards (see InventoryFormPage).
 */
export function ItemPhotoField({
  currentUrl,
  value,
  onChange,
  disabled,
}: {
  /** The item's photo as saved; null for a new item or one without. */
  currentUrl: string | null;
  value: PhotoChange;
  onChange: (change: PhotoChange) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);

  const localUrl = useMemo(
    () => (value.kind === 'set' ? URL.createObjectURL(value.file) : ''),
    [value],
  );
  useEffect(
    () => () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    },
    [localUrl],
  );

  const shown = value.kind === 'set' ? localUrl : value.kind === 'remove' ? null : currentUrl;

  const pick = async (file: File) => {
    setError('');
    const problem = photoFileError(file);
    if (problem) {
      setError(problem);
      return;
    }
    setPreparing(true);
    try {
      onChange({ kind: 'set', file: await downscaleImage(file) });
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="flex items-center gap-md">
      <ItemThumb src={shown} alt="Item photo" className="size-24 rounded-md border border-border-light" iconClassName="size-6" />
      <div className="min-w-0 flex-1">
        <p className="text-label-md text-text-primary">Photo</p>
        <p className="mt-xxs text-caption text-text-tertiary">
          Optional. Shown in the item list and beside the item on quotations and invoices. JPG, PNG or WEBP.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={PHOTO_ACCEPT}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void pick(file);
          }}
        />
        <div className="mt-sm flex flex-wrap gap-xs">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || preparing}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-4" />
            {shown ? 'Change photo' : 'Add photo'}
          </Button>
          {shown && (
            <Button
              size="sm"
              variant="text"
              disabled={disabled || preparing}
              // Undoing a pick, or removing a photo the item never had, is
              // just "no change".
              onClick={() => onChange(currentUrl ? { kind: 'remove' } : { kind: 'keep' })}
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          )}
        </div>
        {error && <p className="mt-xs text-caption text-danger">{error}</p>}
      </div>
    </div>
  );
}

export default ItemPhotoField;
