import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";

export function Toast() {
  const toast = useStore((s) => s.toast);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center safe-b">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            data-testid="toast"
            className="glass glass-strong pointer-events-auto mb-2 flex items-center gap-3 rounded-full py-2.5 pr-2.5 pl-4 text-[14px]"
            initial={{ y: 40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          >
            <span>{toast.message}</span>
            {toast.undo ? (
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                className="rounded-full bg-ink px-3 py-1.5 text-[13px] font-medium text-white"
                onClick={() => {
                  toast.undo?.();
                  dismiss();
                }}
              >
                元に戻す
              </motion.button>
            ) : (
              <span className="w-1" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
