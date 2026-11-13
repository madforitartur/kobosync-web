"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, X } from "lucide-react";
import type { Status } from "@/hooks/useSyncActions";

export function StatusToast({ status, onClose, touch }: { status: Status; onClose: () => void; touch: boolean }) {
  useEffect(() => {
    if (!status || status.type === "info") return;
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [status, onClose]);

  return (
    <AnimatePresence>
      {status && (
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
          className={touch ? "fixed inset-x-4 z-[300]" : "fixed bottom-6 left-1/2 z-[300] w-[480px] max-w-[92vw] -translate-x-1/2"}
          style={touch ? { bottom: "calc(80px + env(safe-area-inset-bottom))" } : undefined}
          role={status.type === "error" ? "alert" : "status"}
          aria-live={status.type === "error" ? "assertive" : "polite"}
        >
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold shadow-2xl ${
            status.type === "error" ? "bg-error text-on-error" : status.type === "success" ? "bg-primary text-on-primary" : "bg-secondary text-on-secondary"
          }`}>
            {status.type === "error" ? <AlertCircle size={18} /> : <Check size={18} />}
            <span className="flex-1">{status.message}</span>
            <button onClick={onClose} aria-label="Fechar aviso"><X size={16} /></button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
