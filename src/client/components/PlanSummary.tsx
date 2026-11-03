import { motion } from "motion/react";
import { formatMin, planActual } from "../../shared/flow";
import { useStore } from "../store";
import { useTick } from "../useTick";

/** 今日タブの予実サマリー行。対象 = 今日/今から + 今日完了した分。対象0件なら出さない */
export function PlanSummary() {
  const filter = useStore((s) => s.filter);
  const tasks = useStore((s) => s.tasks);
  const anyDoing = tasks.some((t) => t.status === "doing");
  const now = useTick(anyDoing);

  if (filter !== "today") return null;
  const { planMin, actualMs, empty } = planActual(tasks, now);
  if (empty) return null;

  const pct = planMin > 0 ? Math.min(100, (actualMs / (planMin * 60_000)) * 100) : 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      data-testid="plan-summary"
      className="glass flex items-center gap-3 rounded-full px-4 py-2 text-[12px] text-mute"
    >
      <span className="shrink-0 tabular-nums">計画 {formatMin(planMin)}</span>
      <span className="shrink-0 tabular-nums">実績 {formatMin(Math.floor(actualMs / 60_000))}</span>
      <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/8">
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full bg-violet-400"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        />
      </span>
    </motion.div>
  );
}
