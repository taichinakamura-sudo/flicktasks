import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import {
  ESTIMATE_CHIPS,
  PRIORITIES,
  type Refinement,
  STATUS_LABEL,
  STATUSES,
  type Task,
} from "../../shared/types";
import { api } from "../api";
import { PRIORITY_LABEL, useStore } from "../store";
import { CheckIcon, CloseIcon, SparkIcon, TrashIcon } from "./Icons";

export function TaskSheet() {
  const id = useStore((s) => s.sheetTaskId);
  const task = useStore((s) => s.tasks.find((t) => t.id === s.sheetTaskId));
  const close = useStore((s) => s.openSheet);
  return (
    <AnimatePresence>
      {id && task && (
        <motion.div key="sheet-root" className="fixed inset-0 z-50 flex items-end justify-center">
          <motion.div
            className="absolute inset-0 bg-ink/15"
            style={{ backdropFilter: "blur(2px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => close(null)}
            data-testid="sheet-backdrop"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="タスクの詳細"
            data-testid="sheet"
            className="glass glass-strong relative w-full max-w-[560px] rounded-t-[28px] px-4 pt-3 safe-b"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) close(null);
            }}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/15" />
            <SheetBody task={task} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SheetBody({ task }: { task: Task }) {
  const update = useStore((s) => s.updateTask);
  const remove = useStore((s) => s.removeTask);
  const toggleStep = useStore((s) => s.toggleStep);
  const close = useStore((s) => s.openSheet);
  const showToast = useStore((s) => s.showToast);

  const [text, setText] = useState(task.text);
  const [refining, setRefining] = useState(false);
  const [suggestion, setSuggestion] = useState<Refinement | null>(null);

  useEffect(() => setText(task.text), [task.text]);

  const commitText = () => {
    const v = text.trim();
    if (v && v !== task.text) update(task.id, { text: v });
    else setText(task.text);
  };

  const refine = async () => {
    setRefining(true);
    try {
      const { refinement } = await api.refine(task.text);
      setSuggestion(refinement);
    } catch {
      showToast("AIを利用できませんでした");
    } finally {
      setRefining(false);
    }
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    const before = { text: task.text, steps: task.steps, priority: task.priority };
    update(task.id, {
      text: suggestion.title,
      steps: suggestion.steps.map((s) => ({ text: s, done: false })),
      priority: suggestion.priority,
    });
    setSuggestion(null);
    showToast("AIの提案を適用しました", () => update(task.id, before));
  };

  return (
    <div className="flex max-h-[78dvh] flex-col gap-4 overflow-y-auto no-scrollbar pb-2">
      <textarea
        aria-label="タスク内容"
        data-testid="sheet-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        rows={1}
        className="min-h-[44px] w-full resize-none bg-transparent px-1 text-[18px] leading-7 outline-none"
      />

      {/* status */}
      <div className="flex rounded-full bg-black/5 p-1" role="tablist" aria-label="ステータス">
        {STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            role="tab"
            aria-selected={task.status === st}
            data-testid={`sheet-status-${st}`}
            onClick={() => update(task.id, { status: st })}
            className="relative flex-1 rounded-full py-1.5 text-[13px] font-medium"
          >
            {task.status === st && (
              <motion.span
                layoutId="sheet-status"
                className="glass-pill absolute inset-0 rounded-full"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className={`relative z-10 ${task.status === st ? "text-ink" : "text-mute"}`}>
              {STATUS_LABEL[st]}
            </span>
          </button>
        ))}
      </div>

      {/* priority */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[12px] text-mute">優先度</span>
        {PRIORITIES.map((p) => (
          <motion.button
            key={p}
            type="button"
            whileTap={{ scale: 0.92 }}
            aria-pressed={task.priority === p}
            data-testid={`priority-${p}`}
            onClick={() => update(task.id, { priority: task.priority === p ? null : p })}
            className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
              task.priority === p ? "bg-ink text-white" : "bg-black/5 text-mute"
            }`}
          >
            {PRIORITY_LABEL[p]}
          </motion.button>
        ))}
      </div>

      {/* estimate (予実: 見積もり分。実測はdoing滞在時間の自動計測) */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[12px] text-mute">見積もり</span>
        {ESTIMATE_CHIPS.map((min) => (
          <motion.button
            key={min}
            type="button"
            whileTap={{ scale: 0.92 }}
            aria-pressed={task.estimateMin === min}
            data-testid={`estimate-${min}`}
            onClick={() => update(task.id, { estimateMin: task.estimateMin === min ? null : min })}
            className={`rounded-full px-3 py-1 text-[12px] font-medium tabular-nums transition-colors ${
              task.estimateMin === min ? "bg-ink text-white" : "bg-black/5 text-mute"
            }`}
          >
            {min}
          </motion.button>
        ))}
        <input
          type="number"
          min={1}
          max={1440}
          inputMode="numeric"
          placeholder="分"
          data-testid="estimate-input"
          onBlur={(e) => {
            const v = Number(e.currentTarget.value);
            if (Number.isInteger(v) && v >= 1 && v <= 1440) update(task.id, { estimateMin: v });
            e.currentTarget.value = "";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
          }}
          className="w-16 rounded-full bg-black/5 px-3 py-1 text-[12px] tabular-nums outline-none placeholder:text-faint"
        />
      </div>

      {/* steps */}
      {task.steps.length > 0 && (
        <ul className="flex flex-col gap-1 px-1" data-testid="steps">
          {task.steps.map((s, i) => (
            <motion.li
              key={s.text}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <button
                type="button"
                data-testid="step"
                aria-pressed={s.done}
                onClick={() => toggleStep(task.id, i)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-black/5"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    s.done ? "border-emerald-400 bg-emerald-400 text-white" : "border-faint/70 bg-white/60"
                  }`}
                >
                  <motion.span
                    initial={false}
                    animate={{ scale: s.done ? 1 : 0 }}
                    transition={{ type: "spring", stiffness: 600, damping: 30 }}
                  >
                    <CheckIcon width={13} height={13} strokeWidth={3} />
                  </motion.span>
                </span>
                <span className={`text-[15px] ${s.done ? "text-faint line-through" : ""}`}>{s.text}</span>
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      {/* AI suggestion */}
      <AnimatePresence initial={false}>
        {suggestion && (
          <motion.div
            key="suggestion"
            data-testid="suggestion"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            className="glass rounded-2xl p-4"
          >
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-mute">
              <SparkIcon width={14} height={14} />
              AIの提案
            </div>
            <div className="text-[16px] font-medium" data-testid="suggestion-title">
              {suggestion.title}
            </div>
            {suggestion.steps.length > 0 && (
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[14px] text-ink/85">
                {suggestion.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
            <div className="mt-2 text-[12px] text-mute">優先度 {PRIORITY_LABEL[suggestion.priority]}</div>
            <div className="mt-3 flex gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                data-testid="suggestion-apply"
                onClick={applySuggestion}
                className="flex-1 rounded-full bg-ink py-2 text-[14px] font-medium text-white"
              >
                適用
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => setSuggestion(null)}
                className="rounded-full bg-black/5 px-4 py-2 text-[14px] font-medium text-mute"
              >
                閉じる
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* actions */}
      <div className="flex items-center gap-2 pt-1">
        <motion.button
          type="button"
          whileTap={{ scale: 0.95 }}
          data-testid="refine"
          onClick={refine}
          disabled={refining}
          className="glass flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-[14px] font-medium disabled:opacity-70"
        >
          <motion.span
            animate={refining ? { rotate: 360 } : { rotate: 0 }}
            transition={refining ? { repeat: Number.POSITIVE_INFINITY, duration: 1.2, ease: "linear" } : {}}
          >
            <SparkIcon width={16} height={16} />
          </motion.span>
          {refining ? "整理中…" : "AIで整理"}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          aria-label="削除"
          data-testid="delete"
          onClick={() => remove(task.id)}
          className="glass flex h-11 w-11 items-center justify-center rounded-full text-rose-500"
        >
          <TrashIcon width={18} height={18} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          aria-label="閉じる"
          data-testid="sheet-close"
          onClick={() => close(null)}
          className="glass flex h-11 w-11 items-center justify-center rounded-full"
        >
          <CloseIcon width={18} height={18} />
        </motion.button>
      </div>
    </div>
  );
}
