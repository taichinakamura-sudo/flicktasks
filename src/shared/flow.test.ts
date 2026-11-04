import { describe, expect, it } from "vitest";
import {
  applyStatus,
  doneSummary,
  elapsedMs,
  formatElapsed,
  formatMin,
  hydrateTask,
  normalizeDoing,
  periodStart,
  planActual,
  sameLocalDay,
  setActualMin,
} from "./flow";
import type { Task } from "./types";

const base = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  text: "x",
  status: "inbox",
  priority: null,
  steps: [],
  estimateMin: null,
  actualMs: 0,
  doingSince: null,
  completedAt: null,
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

describe("applyStatus", () => {
  it("doingに入るとdoingSinceが立つ", () => {
    const t = applyStatus(base({ status: "today" }), "doing", 5000);
    expect(t.status).toBe("doing");
    expect(t.doingSince).toBe(5000);
    expect(t.actualMs).toBe(0);
  });

  it("doingから出るとactualMsに加算されdoingSinceがnullに戻る", () => {
    const t = applyStatus(base({ status: "doing", doingSince: 5000, actualMs: 1000 }), "today", 65_000);
    expect(t.status).toBe("today");
    expect(t.actualMs).toBe(61_000);
    expect(t.doingSince).toBeNull();
  });

  it("doneに入るとcompletedAtが立ち、doing経由なら加算もされる", () => {
    const t = applyStatus(base({ status: "doing", doingSince: 5000 }), "done", 65_000);
    expect(t.completedAt).toBe(65_000);
    expect(t.actualMs).toBe(60_000);
    expect(t.doingSince).toBeNull();

    const t2 = applyStatus(base({ status: "today" }), "done", 9000);
    expect(t2.completedAt).toBe(9000);
    expect(t2.actualMs).toBe(0);
  });

  it("doneから戻すとcompletedAtがnullに戻りactualMsは保持される", () => {
    const t = applyStatus(base({ status: "done", completedAt: 9000, actualMs: 123 }), "doing", 10_000);
    expect(t.completedAt).toBeNull();
    expect(t.actualMs).toBe(123);
    expect(t.doingSince).toBe(10_000);
  });

  it("同じstatusなら何も変わらない", () => {
    const t = base({ status: "doing", doingSince: 5000, actualMs: 42 });
    expect(applyStatus(t, "doing", 99_000)).toEqual(t);
  });
});

describe("normalizeDoing", () => {
  it("doing2件は計測中の最新1件だけ残り、他はtodayへ落ちてactualMsが加算される", () => {
    const a = base({ id: "a", status: "doing", doingSince: 1000 });
    const b = base({ id: "b", status: "doing", doingSince: 2000 });
    const { tasks, demoted } = normalizeDoing([a, b], 10_000);
    const a2 = tasks.find((t) => t.id === "a");
    const b2 = tasks.find((t) => t.id === "b");
    expect(b2?.status).toBe("doing");
    expect(a2?.status).toBe("today");
    expect(a2?.actualMs).toBe(9000);
    expect(a2?.doingSince).toBeNull();
    expect(demoted.map((t) => t.id)).toEqual(["a"]);
  });

  it("doingSinceが全てnullならupdatedAt最新の1件を残す", () => {
    const a = base({ id: "a", status: "doing", updatedAt: 1 });
    const b = base({ id: "b", status: "doing", updatedAt: 5 });
    const { tasks } = normalizeDoing([a, b], 10_000);
    expect(tasks.find((t) => t.id === "b")?.status).toBe("doing");
    expect(tasks.find((t) => t.id === "a")?.status).toBe("today");
  });

  it("doingが1件以下なら何もしない", () => {
    const a = base({ id: "a", status: "doing", doingSince: 1000 });
    const inbox = base({ id: "i" });
    const { tasks, demoted } = normalizeDoing([a, inbox], 10_000);
    expect(tasks).toEqual([a, inbox]);
    expect(demoted).toEqual([]);
  });
});

describe("hydrateTask", () => {
  it("旧形式タスクに新フィールドの既定値を補完する", () => {
    const raw = {
      id: "t1",
      text: "古いメモ",
      status: "doing",
      priority: "mid",
      steps: [{ text: "s", done: false }],
      createdAt: 100,
      updatedAt: 200,
    };
    const t = hydrateTask(raw);
    expect(t).not.toBeNull();
    expect(t?.estimateMin).toBeNull();
    expect(t?.actualMs).toBe(0);
    expect(t?.doingSince).toBeNull();
    expect(t?.completedAt).toBeNull();
    // 旧仕様のdoing(計測情報なし)は勝手にフォーカス枠へ昇格させず今日に落とす(0002と同じ思想)
    expect(t?.status).toBe("today");
    expect(t?.priority).toBe("mid");
  });

  it("doingSinceを持つdoing(新仕様の計測中)はdoingのまま通る", () => {
    const t = hydrateTask(base({ status: "doing", doingSince: 5000 }));
    expect(t?.status).toBe("doing");
    expect(t?.doingSince).toBe(5000);
  });

  it("新フィールド付きのタスクはそのまま通る", () => {
    const t = base({ estimateMin: 30, actualMs: 500, status: "today" });
    expect(hydrateTask(t)).toEqual(t);
  });

  it("Taskの体を成さないものはnull", () => {
    expect(hydrateTask(null)).toBeNull();
    expect(hydrateTask({})).toBeNull();
    expect(hydrateTask({ id: "x", text: "y", status: "bogus" })).toBeNull();
  });
});

describe("setActualMin", () => {
  it("doing以外は実績だけ上書きし、計測状態は変えない", () => {
    const t = setActualMin(base({ status: "today", actualMs: 5_400_000 }), 45, 99_000);
    expect(t.actualMs).toBe(45 * 60_000);
    expect(t.doingSince).toBeNull();
  });

  it("doing中は実績を上書きし、その瞬間から再計測する", () => {
    const t = setActualMin(base({ status: "doing", doingSince: 1000, actualMs: 7_200_000 }), 30, 50_000);
    expect(t.actualMs).toBe(30 * 60_000);
    expect(t.doingSince).toBe(50_000);
  });

  it("0でクリアできる", () => {
    const t = setActualMin(base({ status: "done", actualMs: 999_999, completedAt: 9000 }), 0, 50_000);
    expect(t.actualMs).toBe(0);
    expect(t.completedAt).toBe(9000);
  });
});

describe("elapsedMs", () => {
  it("doing中はactualMs+経過を返す", () => {
    const t = base({ status: "doing", doingSince: 10_000, actualMs: 500 });
    expect(elapsedMs(t, 11_000)).toBe(1500);
  });
  it("doingSinceが未来でも負にならない", () => {
    const t = base({ status: "doing", doingSince: 10_000, actualMs: 500 });
    expect(elapsedMs(t, 9_000)).toBe(500);
  });
  it("doing以外はactualMsそのまま", () => {
    expect(elapsedMs(base({ actualMs: 700 }), 99_999)).toBe(700);
  });
});

describe("sameLocalDay", () => {
  it("同じローカル日ならtrue、日をまたぐとfalse", () => {
    const d1 = new Date(2026, 0, 1, 8, 0).getTime();
    const d2 = new Date(2026, 0, 1, 23, 59).getTime();
    const d3 = new Date(2026, 0, 2, 0, 1).getTime();
    expect(sameLocalDay(d1, d2)).toBe(true);
    expect(sameLocalDay(d2, d3)).toBe(false);
  });
});

describe("planActual", () => {
  const now = new Date(2026, 0, 2, 12, 0).getTime();
  const tasks = [
    base({ id: "a", status: "today", estimateMin: 30 }),
    base({ id: "b", status: "today", estimateMin: null }),
    base({ id: "c", status: "doing", estimateMin: 60, doingSince: now - 120_000, actualMs: 60_000 }),
    base({
      id: "d",
      status: "done",
      estimateMin: 15,
      actualMs: 900_000,
      completedAt: new Date(2026, 0, 1, 20, 0).getTime(), // 昨日の完了は含まない
    }),
    base({
      id: "e",
      status: "done",
      estimateMin: 45,
      actualMs: 300_000,
      completedAt: new Date(2026, 0, 2, 9, 0).getTime(), // 今日の完了は含む
    }),
    base({ id: "f", status: "inbox", estimateMin: 99 }), // メモは含まない
  ];

  it("today+doing全件と今日完了分だけを集計する", () => {
    const r = planActual(tasks, now);
    expect(r.planMin).toBe(135); // 30 + 0 + 60 + 45
    expect(r.actualMs).toBe(480_000); // 0 + 0 + 180_000 + 300_000
    expect(r.empty).toBe(false);
  });

  it("対象が0件ならempty", () => {
    const r = planActual([base({ id: "f", status: "inbox" })], now);
    expect(r.empty).toBe(true);
  });
});

describe("periodStart", () => {
  // 2026-01-07は水曜(1/5が月曜)
  const now = new Date(2026, 0, 7, 15, 30).getTime();

  it("todayはその日の0時", () => {
    expect(periodStart("today", now)).toBe(new Date(2026, 0, 7, 0, 0).getTime());
  });

  it("weekは月曜0時はじまり", () => {
    expect(periodStart("week", now)).toBe(new Date(2026, 0, 5, 0, 0).getTime());
    // 月曜当日はその日自身が開始
    const monday = new Date(2026, 0, 5, 9, 0).getTime();
    expect(periodStart("week", monday)).toBe(new Date(2026, 0, 5, 0, 0).getTime());
    // 日曜は同じ週の月曜まで遡る
    const sunday = new Date(2026, 0, 11, 9, 0).getTime();
    expect(periodStart("week", sunday)).toBe(new Date(2026, 0, 5, 0, 0).getTime());
  });

  it("monthは1日0時はじまり", () => {
    expect(periodStart("month", now)).toBe(new Date(2026, 0, 1, 0, 0).getTime());
  });
});

describe("doneSummary", () => {
  const now = new Date(2026, 0, 7, 15, 30).getTime();
  const done = (id: string, completedAt: number, estimateMin: number | null, actualMs: number): Task =>
    base({ id, status: "done", completedAt, estimateMin, actualMs });
  const tasks = [
    done("a", new Date(2026, 0, 7, 10, 0).getTime(), 30, 45 * 60_000), // 今日
    done("b", new Date(2026, 0, 6, 10, 0).getTime(), null, 10 * 60_000), // 昨日(同週)
    done("c", new Date(2026, 0, 4, 10, 0).getTime(), 60, 0), // 先週日曜(同月)
    done("d", new Date(2025, 11, 31, 10, 0).getTime(), 15, 5 * 60_000), // 先月
    base({ id: "e", status: "today", estimateMin: 99 }), // 未完了は常に対象外
  ];

  it("todayは今日完了した分だけ", () => {
    expect(doneSummary(tasks, "today", now)).toEqual({ count: 1, planMin: 30, actualMs: 45 * 60_000 });
  });

  it("weekは月曜以降の完了分", () => {
    expect(doneSummary(tasks, "week", now)).toEqual({ count: 2, planMin: 30, actualMs: 55 * 60_000 });
  });

  it("monthは今月の完了分", () => {
    expect(doneSummary(tasks, "month", now)).toEqual({ count: 3, planMin: 90, actualMs: 55 * 60_000 });
  });
});

describe("formatElapsed / formatMin", () => {
  it("formatElapsedはm:ss、1時間以上はh:mm:ss", () => {
    expect(formatElapsed(59_000)).toBe("0:59");
    expect(formatElapsed(600_000)).toBe("10:00");
    expect(formatElapsed(3_661_000)).toBe("1:01:01");
  });
  it("formatMinは分、60以上は時間表記(端数0分は省略)", () => {
    expect(formatMin(30)).toBe("30分");
    expect(formatMin(60)).toBe("1時間");
    expect(formatMin(90)).toBe("1時間30分");
  });
});
