import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

/** An item's photo, whole and as large as the window allows. */
export function ItemPhotoDialog({
  src,
  title,
  open,
  onOpenChange,
}: {
  src: string;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-neutral-900/80 data-[state=closed]:animate-scrim-out data-[state=open]:animate-scrim-in motion-reduce:animate-none" />
        <Dialog.Content
          className="fixed inset-0 z-50 flex items-center justify-center p-lg outline-none"
          onClick={() => onOpenChange(false)}
        >
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">Item photo</Dialog.Description>
          <img
            src={src}
            alt={title}
            className="max-h-full max-w-full rounded-md object-contain shadow-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <Dialog.Close
            aria-label="Close photo"
            className="absolute right-lg top-lg flex size-10 items-center justify-center rounded-full bg-neutral-800 text-neutral-0 transition-colors hover:bg-neutral-700"
          >
            <X className="size-5" aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ItemPhotoDialog;
