import { RefObject, useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Traps can nest (CategoryPicker's Modal opens on top of the transaction
// form's Modal). Only the most recently opened one handles keys - otherwise
// one Escape would close every open dialog at once.
const openTraps: HTMLElement[] = [];

// For dialog-like UI (Modal, the mobile sidebar). While `active`:
// - moves focus to the container itself (give it tabIndex={-1}), so a screen
//   reader announces it by its label before anything inside it
// - keeps Tab / Shift+Tab cycling inside it, instead of escaping to the page behind
// - calls onEscape when Escape is pressed
// When it stops being active (or unmounts), focus goes back to whatever had
// it before - usually the button that opened it.
export function useFocusTrap(ref: RefObject<HTMLElement>, active: boolean, onEscape: () => void) {
  // Latest callback without re-running the effect (which would re-grab focus).
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    openTraps.push(container);
    container.focus();

    function focusables() {
      // offsetParent is null for elements hidden with display: none.
      return Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (openTraps[openTraps.length - 1] !== container) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const outside = !container!.contains(current) || current === container;

      if (e.shiftKey && (current === first || outside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || (outside && current !== container))) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openTraps.splice(openTraps.indexOf(container), 1);
      previouslyFocused?.focus?.();
    };
  }, [active, ref]);
}
