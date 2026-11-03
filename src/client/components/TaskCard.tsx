import { motion, type PanInfo, useMotionValue, useTransform } from "motion/react";
import { useRef } from "react";
import { nextStatus, prevStatus, STATUS_LABEL, type Task } from "../../shared/types";
import { PRIORITY_LABEL, useStore } from "../store";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "./Icons";

const FLICK_OFFSET = 88;
const FLICK_VELOCITY = 550;

const PRIORITY_COLOR = { low: "bg-sky-300", mid: "bg-amber-300", high: "bg-rose-400" } as const;

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "いま";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

export function TaskCard({ task }: { task: Task }) {
  const flick = useStore((s) => s.flick);
  const openSheet = useStore((s) => s.openSheet);
  const x = useMotionValue(0);
  // ドラッグ直後の pointerup をタップ扱いにしない
  const dragged = useRef(false);

  const fwd = nextStatus(task.status);
  const back = prevStatus(task.status);

  // 右へ引くと「次へ」、左へ引くと「戻す」のレイヤーがせり出す
  const fwdOpacity = useTransform(x, [0, 40, FLICK_OFFSET], [0, 0.4, 1]);
  const backOpacity = useTransform(x, [-FLICK_OFFSET, -40, 0], [1, 0.4, 0]);
  const fwdScale = useTransform(x, [0, FLICK_OFFSET], [0.7, 1.1]);
  const backScale = useTransform(x, [-FLICK_OFFSET, 0], [1.1, 0.7]);
  const tilt = useTransform(x, [-200, 200], [-2.5, 2.5]);

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

  const doneSteps = task.steps.filter((s) => s.done).length;

  return (
    <div className="relative" data-testid="task-card" data-status={task.status} data-id={task.id}>
      {/* reveal layers */}
      <motion.div
        aria-hidden
        style={{ opacity: fwdOpacity }}
        className={`absolute inset-0 flex items-center justify-start rounded-[22px] pl-5 ${
          fwd === "done" ? "bg-emerald-200/70" : "bg-sky-200/70"
        }`}
      >
        <motion.span
          style={{ scale: fwdScale }}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-ink/80"
        >
          {fwd ? (
            <>
              {fwd === "done" ? (
                <CheckIcon width={18} height={18} />
              ) : (
                <ArrowRightIcon width={18} height={18} />
              )}
              {STATUS_LABEL[fwd]}へ
            </>
          ) : (
            <CheckIcon width={18} height={18} />
          )}
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
          {back ? (
            <>
              {STATUS_LABEL[back]}へ戻す
              <ArrowLeftIcon width={18} height={18} />
            </>
          ) : (
            <ArrowLeftIcon width={18} height={18} />
          )}
        </motion.span>
      </motion.div>

      {/* card */}
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
        style={{ x, rotate: tilt, touchAction: "pan-y" }}
        whileTap={{ scale: 0.985 }}
        whileDrag={{ scale: 1.02, boxShadow: "0 24px 48px -18px rgba(30,40,80,.35)" }}
        className="glass relative cursor-grab select-none rounded-[22px] px-4 py-3.5 active:cursor-grabbing"
      >
        <div className="flex items-start gap-3">
          {task.priority && (
            <span
              role="img"
              aria-label={`優先度 ${PRIORITY_LABEL[task.priority]}`}
              className={`mt-2 h-2 w-2 shrink-0 rounded-full ${PRIORITY_COLOR[task.priority]}`}
            />
          )}
          <p
            className={`line-clamp-3 flex-1 whitespace-pre-wrap text-[16px] leading-6 ${
              task.status === "done" ? "text-mute line-through decoration-faint" : ""
            }`}
            data-testid="task-text"
          >
            {task.text}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-3 text-[12px] text-faint">
          <span>{relTime(task.createdAt)}</span>
          {task.steps.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-black/8">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-400"
                  initial={false}
                  animate={{ width: `${(doneSteps / task.steps.length) * 100}%` }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                />
              </span>
              <span className="tabular-nums">
                {doneSteps}/{task.steps.length}
              </span>
            </span>
          )}
        </div>
      </motion.div>
    </div>
  );
}
