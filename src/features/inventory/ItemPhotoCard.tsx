import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, Maximize2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { downscaleImage } from '@/features/inventory/downscaleImage';
import { ItemPhotoDialog } from '@/features/inventory/ItemPhotoDialog';
import { PHOTO_ACCEPT, photoFileError } from '@/features/inventory/itemPhoto';
import { ItemThumb } from '@/features/inventory/ItemThumb';
import type { InventoryItem } from '@/models/inventory';
import { deleteItemImage, uploadItemImage } from '@/networks/inventory/inventoryNetwork';

/**
 * The photo on an item's page: shown large, opened full size on click, and —
 * for whoever may edit the item — added, changed or removed in place. A photo
 * is catalogue data like the name, so it follows `inventory.manageItems`.
 */
export function ItemPhotoCard({ item, canManage }: { item: InventoryItem; canManage: boolean }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewing, setViewing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // The answer is the item with fresh links: it replaces the cached item, and
  // the lists and pickers refetch so their thumbnails follow.
  const settle = (updated: InventoryItem) => {
    queryClient.setQueryData(['inventory', 'items', item.id], updated);
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const ready = await downscaleImage(file);
      return uploadItemImage(item.id, ready, ready.name);
    },
    onSuccess: (updated) => {
      settle(updated);
      toast.success('Photo saved');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'The photo was not saved.'),
  });

  const remove = useMutation({
    mutationFn: () => deleteItemImage(item.id),
    onSuccess: (updated) => {
      settle(updated);
      setConfirmRemove(false);
      toast.success('Photo removed');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'The photo was not removed.'),
  });

  const busy = upload.isPending || remove.isPending;
  if (!item.imageUrl && !canManage) return null;

  return (
    <Card className="overflow-hidden">
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const problem = photoFileError(file);
          if (problem) toast.error(problem);
          else upload.mutate(file);
        }}
      />

      <div className="relative">
        {item.imageUrl ? (
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="group block w-full bg-neutral-50"
            aria-label={`View the photo of ${item.name} full size`}
          >
            <ItemThumb src={item.imageUrl} alt={item.name} className="h-64 w-full object-contain" iconClassName="size-8" />
            <span className="absolute right-sm top-sm flex size-8 items-center justify-center rounded-full bg-surface/90 text-text-secondary opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              <Maximize2 className="size-4" aria-hidden="true" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex h-40 w-full flex-col items-center justify-center gap-xs bg-primary-tint text-primary transition-colors hover:bg-primary-light"
          >
            <ImagePlus className="size-6" aria-hidden="true" />
            <span className="text-label-md">Add a photo</span>
          </button>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70">
            <Loader2 className="size-6 animate-spin text-primary" aria-label="Saving photo" />
          </div>
        )}
      </div>

      {item.imageUrl && canManage && (
        <div className="flex justify-end gap-xs border-t border-border-light px-md py-xs">
          <Button size="sm" variant="text" disabled={busy} onClick={() => inputRef.current?.click()}>
            <ImagePlus className="size-4" />
            Change
          </Button>
          <Button size="sm" variant="text" disabled={busy} onClick={() => setConfirmRemove(true)}>
            <Trash2 className="size-4" />
            Remove
          </Button>
        </div>
      )}

      {item.imageUrl && (
        <ItemPhotoDialog src={item.imageUrl} title={item.name} open={viewing} onOpenChange={setViewing} />
      )}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove photo"
        description={`The photo of ${item.name} will no longer show in lists or on documents.`}
        confirmLabel="Remove photo"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}

export default ItemPhotoCard;
