// hidane-flow: ステータス遷移の副作用(タイマー・完了時刻)と予実集計の純粋関数。
// doing(今から)滞在時間を自動計測して実績にする。store/workerはここの結果を保存するだけ。

import { PRIORITIES, STATUSES, type Status, type Step, type Task } from "./types";

/** 遷移の副作用を適用した新しいタスクを返す。status変化なしなら同値を返す */
export function applyStatus(task: Task, next: Status, now: number): Task {
  if (task.status === next) return task;
  let { actualMs, doingSince, completedAt } = task;
  if (task.status === "doing" && doingSince !== null) {
    actualMs += Math.max(0, now - doingSince);
  }
  doingSince = next === "doing" ? now : null;
  completedAt = next === "done" ? now : null;
  return { ...task, status: next, actualMs, doingSince, completedAt };
}

/**
 * doingを最大1件に正規化する(読み込み・取り込み・Undo復元の保険)。
 * 残すのは doingSince 降順(nullは最後)、同着は updatedAt 降順の先頭。他は today へ。
 */
export function normalizeDoing(tasks: Task[], now: number): { tasks: Task[]; demoted: Task[] } {
  const doing = tasks.filter((t) => t.status === "doing");
  if (doing.length <= 1) return { tasks, demoted: [] };
  const keep = [...doing].sort(
    (a, b) => (b.doingSince ?? -1) - (a.doingSince ?? -1) || b.updatedAt - a.updatedAt,
  )[0];
  const demoted: Task[] = [];
  const next = tasks.map((t) => {
    if (t.status !== "doing" || t.id === keep.id) return t;
    const d = applyStatus(t, "today", now);
    demoted.push(d);
    return d;
  });
  return { tasks: next, demoted };
}

const isStatus = (v: unknown): v is Status => STATUSES.includes(v as Status);

/** 旧形式(新フィールド無し)のデータに既定値を補完する。Taskの体を成さなければnull */
export function hydrateTask(raw: unknown): Task | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.text !== "string" || !isStatus(r.status)) return null;
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const steps: Step[] = Array.isArray(r.steps)
    ? r.steps.filter(
        (s): s is Step =>
          typeof s === "object" && s !== null && typeof (s as Step).text === "string" && typeof (s as Step).done === "boolean",
      )
    : [];
  return {
    id: r.id,
    text: r.text,
    status: r.status,
    priority: PRIORITIES.includes(r.priority as (typeof PRIORITIES)[number])
      ? (r.priority as Task["priority"])
      : null,
    steps,
    estimateMin: numOrNull(r.estimateMin),
    actualMs: num(r.actualMs, 0),
    doingSince: numOrNull(r.doingSince),
    completedAt: numOrNull(r.completedAt),
    createdAt: num(r.createdAt, 0),
    updatedAt: num(r.updatedAt, 0),
  };
}

/** 実測の現在値。doing中は経過を足す(時計ずれで負にはならない) */
export function elapsedMs(task: Task, now: number): number {
  return task.actualMs + (task.doingSince !== null ? Math.max(0, now - task.doingSince) : 0);
}

/** 端末ローカルタイムで同じ日か */
export function sameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
  );
}

/** 今日の予実。対象 = today/doing全件 + 今日完了したdone */
export function planActual(tasks: Task[], now: number): { planMin: number; actualMs: number; empty: boolean } {
  const target = tasks.filter(
    (t) =>
      t.status === "today" ||
      t.status === "doing" ||
      (t.status === "done" && t.completedAt !== null && sameLocalDay(t.completedAt, now)),
  );
  return {
    planMin: target.reduce((sum, t) => sum + (t.estimateMin ?? 0), 0),
    actualMs: target.reduce((sum, t) => sum + elapsedMs(t, now), 0),
    empty: target.length === 0,
  };
}

/** 経過時間表示。m:ss、1時間以上は h:mm:ss */
export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 分の表示。60以上は時間表記(端数0分は省略) */
export function formatMin(min: number): string {
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}
