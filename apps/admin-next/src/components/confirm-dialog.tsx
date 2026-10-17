'use client';

import { Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * "Are you sure?" before anything is deleted or removed. Use it for every
 * destructive action. The dialog stays open while the request runs; close it
 * (onOpenChange(false)) when the request succeeds.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, pendingLabel = 'Deleting…', cancelLabel = 'Cancel', pending = false, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Names the action: "Delete program", "Remove volume". */
  confirmLabel: string;
  pendingLabel?: string;
  /** Names what is kept: "Keep program". */
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={(event) => { event.preventDefault(); onConfirm(); }}
          >
            {pending && <Loader2 className="animate-spin" />}
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
