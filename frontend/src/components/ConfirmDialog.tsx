import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./ui";

/** Native modal dialog: focus trapping and Esc-to-close come from the browser. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="confirm-title"
      className="card m-auto w-[calc(100%-2rem)] max-w-md p-6 text-text"
    >
      <h2 id="confirm-title" className="display text-2xl">{title}</h2>
      <div className="mt-3 text-sm text-text-2 space-y-2">{children}</div>
      <div className="mt-6 flex justify-end gap-2.5">
        <Button variant="ghost" onClick={onClose}>
          Back
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
