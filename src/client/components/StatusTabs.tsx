import { motion } from "motion/react";
import { useMemo } from "react";
import { STATUS_LABEL, STATUSES } from "../../shared/types";
import { useStore } from "../store";

export function StatusTabs() {
  const filter = useStore((s) => s.filter);
  const setFilter = useStore((s) => s.setFilter);
  const tasks = useStore((s) => s.tasks);
  const counts = useMemo(() => {
    const c = { inbox: 0, today: 0, doing: 0, done: 0 };
    for (const t of tasks) c[t.status]++;
    return c;
  }, [tasks]);

  return (
    <div className="glass flex rounded-full p-1" role="tablist" aria-label="ステータス">
      {STATUSES.map((st) => {
        const active = st === filter;
        return (
          <button
            key={st}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`tab-${st}`}
            onClick={() => setFilter(st)}
            className="relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-[14px] font-medium"
          >
            {active && (
              <motion.span
                layoutId="tab-indicator"
                className="glass-pill absolute inset-0 rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className={`relative z-10 ${active ? "text-ink" : "text-mute"}`}>{STATUS_LABEL[st]}</span>
            <motion.span
              key={counts[st]}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              data-testid={`count-${st}`}
              className={`relative z-10 min-w-5 rounded-full px-1.5 text-[11px] leading-5 tabular-nums ${
                active ? "bg-ink text-white" : "bg-black/5 text-mute"
              }`}
            >
              {counts[st]}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
