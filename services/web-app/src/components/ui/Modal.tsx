import { useId, useRef, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import styles from './Modal.module.css';

const CLOSE_ANIMATION_MS = 300;

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  function handleClose() {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  // Focus moves into the dialog on open, stays inside it while open, Escape
  // closes it, and focus returns to whatever opened it. The trap is released
  // as soon as closing *starts*, not after the 300ms animation - otherwise
  // the closing dialog keeps swallowing keys, e.g. a quick second Escape
  // meant for the dialog underneath (found by e2e/tests/categories.spec.ts).
  useFocusTrap(dialogRef, !isClosing, handleClose);

  return (
    <div className={`${styles.overlay} ${isClosing ? styles.overlayClosing : ''}`} onClick={handleClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${styles.modal} ${isClosing ? styles.modalClosing : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button className={styles.closeButton} onClick={handleClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  );
}
