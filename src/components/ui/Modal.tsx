import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const WIDTHS = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl'
} as const;

// Large dialogs keep one height while tabs or content change, so they never jump in size.
const HEIGHTS = {
  sm: 'max-h-[88dvh]',
  md: 'max-h-[88dvh]',
  lg: 'h-[min(88dvh,760px)]',
  xl: 'h-[min(88dvh,820px)]'
} as const;

const FOCUSABLE = 'button:not(:disabled), a[href], input:not([hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Optional one-line context shown beside the title. Keep it short. */
  meta?: React.ReactNode;
  size?: keyof typeof WIDTHS;
  footer?: React.ReactNode;
  closeLabel?: string;
  /** Remove the body padding, for layouts that manage their own (e.g. a sidebar). */
  flush?: boolean;
  children: React.ReactNode;
}

/** Shared overlay shell: backdrop, title bar, scrolling body, optional footer, focus trap. */
export function Modal({ isOpen, onClose, title, meta, size = 'lg', footer, closeLabel = 'Close', flush = false, children }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[12000] flex items-center justify-center p-4 bg-slate-950/40"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`overlay-text w-full ${WIDTHS[size]} ${HEIGHTS[size]} flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl outline-none`}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
          if (event.key !== 'Tab') return;
          const items = panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
          if (!items?.length) return;
          const first = items[0], last = items[items.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }}
      >
        <header className="flex items-center justify-between gap-4 px-5 h-14 shrink-0 border-b border-slate-200">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-slate-900 truncate">{title}</h2>
            {meta && <span className="text-sm text-slate-500 truncate">{meta}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label={closeLabel} className="p-1.5 -mr-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar ${flush ? '' : 'p-5'}`}>{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 px-5 py-3 shrink-0 border-t border-slate-200">{footer}</footer>}
      </div>
    </div>
  );
}

/** Button styles shared by overlay footers and bodies. */
export const modalButton = {
  primary: 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md bg-[#232F3E] hover:bg-[#1A232E] text-white text-sm font-medium disabled:opacity-40 transition-colors',
  secondary: 'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium disabled:opacity-40 transition-colors'
};
