import { useEffect, useId, useRef, type ReactNode } from "react";

import { Button } from "../ui/primitives";

interface JourneyGuideDialogProps {
  open: boolean;
  gate: string;
  title: string;
  description: string;
  children: ReactNode;
  primaryLabel?: string;
  primaryPending?: boolean;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function JourneyGuideDialog({
  open,
  gate,
  title,
  description,
  children,
  primaryLabel,
  primaryPending = false,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: JourneyGuideDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="journey-guide-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onSecondary?.();
      }}
    >
      <div className="journey-guide-index" aria-hidden="true"><span>{gate}</span><i /></div>
      <header>
        <span>Web-first launch guide</span>
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
      </header>
      <div className="journey-guide-body">{children}</div>
      {primaryLabel || secondaryLabel ? (
        <footer>
          {secondaryLabel ? <Button type="button" variant="ghost" onClick={onSecondary}>{secondaryLabel}</Button> : null}
          {primaryLabel ? <Button type="button" variant="primary" disabled={primaryPending} onClick={onPrimary}>{primaryPending ? "준비 중…" : primaryLabel}</Button> : null}
        </footer>
      ) : null}
    </dialog>
  );
}
