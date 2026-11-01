import { useEffect, useRef, type ReactNode } from 'react';

/** A small anchored panel that closes on outside click or Escape. */
export function Popover({ open, onClose, children, label, align = 'right' }: { open: boolean; onClose: () => void; children: ReactNode; label: string; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`popover popover-${align}`} role="dialog" aria-label={label}>
      {children}
    </div>
  );
}
