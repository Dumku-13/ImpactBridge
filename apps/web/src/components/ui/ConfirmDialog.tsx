import type { ReactNode } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

/**
 * Confirmation for a destructive action.
 *
 * Several delete buttons in the app fired on a single click with no confirm
 * step at all — one stray tap removed a grant or a team member outright. This
 * is the standard gate for anything that destroys data.
 *
 * Deliberately not `window.confirm`: it can't be styled, it blocks the main
 * thread, it's suppressible by the browser, and on mobile it reads as a browser
 * warning rather than something the app is asking.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  /*
   * Red is not the only kind of irreversible. Marking a grant complete destroys
   * nothing, but it cannot be undone — it deserves the gate without the alarm,
   * so the confirm button's colour is a caller's choice. Destructive stays the
   * default, since that is what this dialog was built for.
   */
  confirmVariant = "destructive",
  isPending = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "destructive" | "primary";
  isPending?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} showClose={false}>
      <h2 className="font-display text-xl font-semibold text-foreground">
        {title}
      </h2>
      <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        {/*
          Cancel first in the DOM so it takes initial focus — the safe option
          should be the one you get by pressing Enter on arrival.
        */}
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          onClick={onConfirm}
          isLoading={isPending}
        >
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
