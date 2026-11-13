"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** telemóvel: folha por baixo; PC: caixa ao centro ou gaveta lateral */
  touch: boolean;
  side?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

/** Contentor genérico: folha inferior (telemóvel), gaveta lateral ou caixa central (PC). */
export function Modal({ open, onClose, title, touch, side, children, footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const panelClass = touch
    ? "fixed inset-x-0 bottom-0 z-[250] flex max-h-[88vh] flex-col rounded-t-2xl bg-background shadow-2xl"
    : side
      ? "fixed inset-y-0 right-0 z-[250] flex w-[440px] max-w-full flex-col bg-background shadow-2xl"
      : "fixed left-1/2 top-1/2 z-[250] flex max-h-[85vh] w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl bg-background shadow-2xl";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[240] bg-black/45"
            onClick={onClose}
          />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            initial={touch ? { y: "100%" } : side ? { x: "100%" } : { opacity: 0, scale: 0.97 }}
            animate={touch ? { y: 0 } : side ? { x: 0 } : { opacity: 1, scale: 1 }}
            exit={touch ? { y: "100%" } : side ? { x: "100%" } : { opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className={panelClass}
            style={touch ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
          >
            <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-3.5">
              <h2 className="truncate font-display-lg text-xl font-bold text-primary">{title}</h2>
              <button onClick={onClose} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container">
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="border-t border-outline-variant px-5 py-3">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
