import { motion } from "motion/react";
import { useState } from "react";
import { doneSummary, formatMin, type RetroPeriod } from "../../shared/flow";
import { useStore } from "../store";
import { useTick } from "../useTick";

const PERIODS: { key: RetroPeriod; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "今週" },
  { key: "month", label: "今月" },
];

/** 完了タブの振り返り集計行。期間内の完了件数と予実合計。完了が1件もなければ出さない */
export function DoneSummary() {
  const filter = useStore((s) => s.filter);
  const tasks = useStore((s) => s.tasks);
  const [period, setPeriod] = useState<RetroPeriod>("today");
  // 表示中は現在時刻で再評価する(日またぎで昨日の完了を今日扱いしないため)
  const now = useTick(filter === "done");

  if (filter !== "done") return null;
  if (!tasks.some((t) => t.status === "done")) return null;
  const { count, planMin, actualMs } = doneSummary(tasks, period, now);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      data-testid="done-summary"
      className="glass flex items-center gap-2 rounded-full px-2 py-1.5 text-[12px] text-mute"
    >
      <span className="flex rounded-full bg-black/5 p-0.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            data-testid={`period-${p.key}`}
            onClick={() => setPeriod(p.key)}
            className={`rounded-full px-2.5 py-0.5 font-medium transition-colors ${
              period === p.key ? "glass-pill text-ink" : "text-mute"
            }`}
          >
            {p.label}
          </button>
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-right tabular-nums">
        完了 {count}件 ・ 計画 {formatMin(planMin)} ・ 実績 {formatMin(Math.floor(actualMs / 60_000))}
      </span>
    </motion.div>
  );
}
