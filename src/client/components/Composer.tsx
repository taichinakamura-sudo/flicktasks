import { motion, useAnimate } from "motion/react";
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { PlusIcon } from "./Icons";

export function Composer() {
  const addTask = useStore((s) => s.addTask);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const [scope, animate] = useAnimate();

  const submit = useCallback(() => {
    const task = addTask(value);
    if (!task) return;
    setValue("");
    // 追加の手応え: ボタンがぽんと跳ねる
    void animate(
      ".composer-btn",
      { scale: [1, 1.25, 1], rotate: [0, 90, 90] },
      { duration: 0.45, ease: "easeOut" },
    );
    ref.current?.focus();
  }, [addTask, value, animate]);

  // 開いた瞬間に書ける: 初期フォーカス
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  // どこにもフォーカスがない状態でキーを打ち始めたら、そのままメモ欄へ流す
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const el = document.activeElement;
      if (el && el !== document.body && el.tagName !== "DIV") return;
      ref.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 変換確定の Enter では送信しない
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <motion.div
      ref={scope}
      layout
      className="glass flex items-end gap-2 rounded-[22px] p-2 pl-4"
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      <textarea
        ref={ref}
        data-testid="composer"
        aria-label="メモ"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="メモ"
        rows={1}
        enterKeyHint="done"
        autoFocus
        className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[17px] leading-6 outline-none placeholder:text-faint"
      />
      <motion.button
        type="button"
        data-testid="composer-submit"
        aria-label="追加"
        onClick={submit}
        disabled={!value.trim()}
        whileTap={{ scale: 0.9 }}
        animate={{ opacity: value.trim() ? 1 : 0.45 }}
        className="composer-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-lg shadow-ink/20"
      >
        <PlusIcon />
      </motion.button>
    </motion.div>
  );
}
