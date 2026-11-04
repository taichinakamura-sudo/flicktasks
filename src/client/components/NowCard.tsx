import { AnimatePresence, motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { useRef } from "react";
import { elapsedMs, formatElapsed, formatMin } from "../../shared/flow";
import type { Task } from "../../shared/types";
import { useStore } from "../store";
import { useTick } from "../useTick";
import { ArrowLeftIcon, CheckIcon } from "./Icons";

const FLICK_OFFSET = 88;
const FLICK_VELOCITY = 550;

/**
 * 「▶ 今から」固定カード。doing(最大1件)のタスクをどのタブでも表示し、経過時間をライブ表示する。
 * 右フリック=完了 / 左フリック=今日に戻す / タップ=詳細シート。
 */
export function NowCard() {
  const task = useStore((s) => s.tasks.find((t) => t.status === "doing"));
  return (
    // mode="wait": 入れ替わり時に前のカードの退場を待ってから次を出す(同時に2枚存在させない)
    <AnimatePresence initial={false} mode="wait">
      {task && (
        <motion.div
          key={task.id}
          layout
          initial={{ opacity: 0, y: -14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
        >
          <NowCardBody task={task} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NowCardBody({ task }: { task: Task }) {
  const flick = useStore((s) => s.flick);
  const openSheet = useStore((s) => s.openSheet);
  const now = useTick(true);
  const x = useMotionValue(0);
  const dragged = useRef(false);

  const fwdOpacity = useTransform(x, [0, 40, FLICK_OFFSET], [0, 0.4, 1]);
  const backOpacity = useTransform(x, [-FLICK_OFFSET, -40, 0], [1, 0.4, 0]);
  const fwdScale = useTransform(x, [0, FLICK_OFFSET], [0.7, 1.1]);
  const backScale = useTransform(x, [-FLICK_OFFSET, 0], [1.1, 0.7]);

  const elapsed = elapsedMs(task, now);
  const over = task.estimateMin !== null && elapsed > task.estimateMin * 60_000;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    setTimeout(() => {
      dragged.current = false;
    }, 50);
    const { offset, velocity } = info;
    const dir =
      offset.x > FLICK_OFFSET || velocity.x > FLICK_VELOCITY
        ? 1
        : offset.x < -FLICK_OFFSET || velocity.x < -FLICK_VELOCITY
          ? -1
          : 0;
    if (dir !== 0) flick(task.id, dir);
  };

  return (
    <div className="relative">
      {/* reveal layers: 右=完了 / 左=今日に戻す */}
      <motion.div
        aria-hidden
        style={{ opacity: fwdOpacity }}
        className="absolute inset-0 flex items-center justify-start rounded-[22px] bg-emerald-200/70 pl-5"
      >
        <motion.span
          style={{ scale: fwdScale }}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-ink/80"
        >
          <CheckIcon width={18} height={18} />
          完了へ
        </motion.span>
      </motion.div>
      <motion.div
        aria-hidden
        style={{ opacity: backOpacity }}
        className="absolute inset-0 flex items-center justify-end rounded-[22px] bg-amber-100/80 pr-5"
      >
        <motion.span
          style={{ scale: backScale }}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-ink/80"
        >
          今日へ戻す
          <ArrowLeftIcon width={18} height={18} />
        </motion.span>
      </motion.div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.85}
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 500, bounceDamping: 34 }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={onDragEnd}
        onTap={() => {
          if (!dragged.current) openSheet(task.id);
        }}
        style={{ x, touchAction: "pan-y" }}
        whileTap={{ scale: 0.985 }}
        whileDrag={{ scale: 1.02, boxShadow: "0 24px 48px -18px rgba(30,40,80,.35)" }}
        data-testid="now-card"
        className="glass glass-strong relative cursor-grab select-none rounded-[22px] px-4 py-3.5 ring-2 ring-violet-300/70 active:cursor-grabbing"
      >
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-[13px] font-semibold text-violet-500">▶ 今から</span>
          <p className="min-w-0 flex-1 truncate text-[16px] leading-6">{task.text}</p>
          <span
            data-testid="now-elapsed"
            className={`shrink-0 text-[15px] font-semibold tabular-nums ${over ? "text-rose-500" : "text-ink"}`}
          >
            {formatElapsed(elapsed)}
          </span>
          {task.estimateMin !== null && (
            <span className="shrink-0 text-[12px] tabular-nums text-faint">
              / {formatMin(task.estimateMin)}
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
