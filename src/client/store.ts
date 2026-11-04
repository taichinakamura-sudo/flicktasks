import { create } from "zustand";
import { applyStatus, hydrateTask, normalizeDoing } from "../shared/flow";
import type { Priority, Status, Step, Task, TaskPatch, User } from "../shared/types";
import { nextStatus, prevStatus } from "../shared/types";
import { api } from "./api";

const STORAGE_KEY = "flicktasks:v1";
const MIN_SKELETON_MS = 450;

type Persisted = { ownerId: string | null; tasks: Task[] };

type Toast = { id: number; message: string; undo?: () => void };

type State = {
  booted: boolean;
  user: User | null;
  /** tasks の持ち主。null = ゲスト(ローカルのみ) */
  ownerId: string | null;
  tasks: Task[];
  filter: Status;
  toast: Toast | null;
  sheetTaskId: string | null;
  lastFlickDir: 1 | -1;

  boot: () => Promise<void>;
  setFilter: (f: Status) => void;
  addTask: (text: string) => Task | null;
  updateTask: (id: string, patch: TaskPatch) => void;
  flick: (id: string, dir: 1 | -1) => boolean;
  toggleStep: (id: string, index: number) => void;
  removeTask: (id: string) => void;
  openSheet: (id: string | null) => void;
  showToast: (message: string, undo?: () => void) => void;
  dismissToast: () => void;
  logout: () => Promise<void>;
};

function loadLocal(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ownerId: null, tasks: [] };
    const p = JSON.parse(raw) as Partial<Persisted>;
    // 旧形式(新フィールド無し)のデータにも既定値を補完して読む
    const tasks = Array.isArray(p.tasks) ? p.tasks.map(hydrateTask).filter((t): t is Task => t !== null) : [];
    return { ownerId: p.ownerId ?? null, tasks };
  } catch {
    return { ownerId: null, tasks: [] };
  }
}

function saveLocal(p: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

const sortTasks = (tasks: Task[]) => [...tasks].sort((a, b) => b.createdAt - a.createdAt);

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>()((set, get) => {
  /** サーバーへの反映。失敗したら通知だけ出す(ローカル状態は保持 = オフラインでも使える) */
  const remote = (fn: () => Promise<unknown>) => {
    if (!get().user) return;
    fn().catch(() => get().showToast("同期に失敗しました"));
  };

  /** 読み込み正規化で今日へ押し出された分をサーバーへ反映(boot中はuser未セットのため直接呼ぶ) */
  const pushDemoted = (demoted: Task[]) => {
    for (const d of demoted) {
      api
        .updateTask(d.id, { status: d.status, actualMs: d.actualMs, doingSince: d.doingSince })
        .catch(() => {});
    }
  };

  return {
    booted: false,
    user: null,
    ownerId: null,
    tasks: [],
    filter: "inbox",
    toast: null,
    sheetTaskId: null,
    lastFlickDir: 1,

    boot: async () => {
      const started = performance.now();
      const local = loadLocal();
      // doingは最大1件(今から)。旧データや復元で複数あればここで正規化する
      set({ tasks: normalizeDoing(sortTasks(local.tasks), Date.now()).tasks, ownerId: local.ownerId });

      let user: User | null = null;
      try {
        user = (await api.me()).user;
      } catch {
        user = null;
      }

      if (user) {
        try {
          let tasks: Task[];
          if (local.ownerId === null && local.tasks.length > 0) {
            // ゲスト時代のメモをサーバーへ取り込む
            tasks = (await api.importTasks(local.tasks)).tasks;
          } else if (local.ownerId !== user.id) {
            tasks = (await api.listTasks()).tasks;
          } else {
            tasks = (await api.listTasks()).tasks;
          }
          const norm = normalizeDoing(sortTasks(tasks), Date.now());
          pushDemoted(norm.demoted);
          set({ user, ownerId: user.id, tasks: norm.tasks });
        } catch {
          // オフライン等: 同じユーザーならローカルキャッシュをそのまま使う
          set({ user, ownerId: user.id, tasks: local.ownerId === user.id ? get().tasks : [] });
        }
      } else if (local.ownerId !== null) {
        // セッション切れ: 他人のデータを残さない
        set({ user: null, ownerId: null, tasks: [] });
      }

      const wait = Math.max(0, MIN_SKELETON_MS - (performance.now() - started));
      await new Promise((r) => setTimeout(r, wait));
      set({ booted: true });
    },

    setFilter: (filter) => set({ filter }),

    addTask: (raw) => {
      const text = raw.trim();
      if (!text) return null;
      const now = Date.now();
      const task: Task = {
        id: crypto.randomUUID(),
        text,
        status: "inbox",
        priority: null,
        steps: [],
        estimateMin: null,
        actualMs: 0,
        doingSince: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({ tasks: [task, ...s.tasks], filter: "inbox" }));
      remote(() => api.createTask(task));
      return task;
    },

    updateTask: (id, patch) => {
      const now = Date.now();
      const current = get().tasks.find((t) => t.id === id);
      if (!current) return;
      let next: Task = { ...current, ...patch, updatedAt: now };
      let payload: TaskPatch = patch;
      const demoted: Task[] = [];
      if (patch.status !== undefined && patch.status !== current.status) {
        // 遷移副作用(タイマー・完了時刻)を適用。doingへ入れる時は他のdoingを今日へ押し出す(今からは1件)
        next = { ...applyStatus(current, patch.status, now), ...patch, updatedAt: now };
        payload = {
          ...patch,
          actualMs: next.actualMs,
          doingSince: next.doingSince,
          completedAt: next.completedAt,
        };
        if (patch.status === "doing") {
          for (const t of get().tasks) {
            if (t.id !== id && t.status === "doing") {
              demoted.push({ ...applyStatus(t, "today", now), updatedAt: now });
            }
          }
        }
      }
      const demotedById = new Map(demoted.map((d) => [d.id, d]));
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? next : (demotedById.get(t.id) ?? t))),
      }));
      remote(() => api.updateTask(id, payload));
      for (const d of demoted) {
        remote(() =>
          api.updateTask(d.id, { status: d.status, actualMs: d.actualMs, doingSince: d.doingSince }),
        );
      }
    },

    flick: (id, dir) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return false;
      const next = dir === 1 ? nextStatus(task.status) : prevStatus(task.status);
      if (!next) return false;
      set({ lastFlickDir: dir });
      get().updateTask(id, { status: next });
      return true;
    },

    toggleStep: (id, index) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      const steps: Step[] = task.steps.map((st, i) => (i === index ? { ...st, done: !st.done } : st));
      get().updateTask(id, { steps });
    },

    removeTask: (id) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id), sheetTaskId: null }));
      remote(() => api.deleteTask(id));
      get().showToast("削除しました", () => {
        // 復元でdoingが2件にならないよう正規化を通す
        set((s) => ({ tasks: normalizeDoing(sortTasks([task, ...s.tasks]), Date.now()).tasks }));
        remote(() => api.createTask(task));
      });
    },

    openSheet: (sheetTaskId) => set({ sheetTaskId }),

    showToast: (message, undo) => {
      clearTimeout(toastTimer);
      const id = ++toastSeq;
      set({ toast: { id, message, undo } });
      toastTimer = setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, 4500);
    },
    dismissToast: () => set({ toast: null }),

    logout: async () => {
      try {
        await api.logout();
      } catch {
        /* ignore */
      }
      set({ user: null, ownerId: null, tasks: [], sheetTaskId: null });
    },
  };
});

// 永続化: tasks / ownerId が変わるたびに localStorage へ
useStore.subscribe((s, prev) => {
  if (s.tasks !== prev.tasks || s.ownerId !== prev.ownerId) saveLocal({ ownerId: s.ownerId, tasks: s.tasks });
});

export const PRIORITY_LABEL: Record<Priority, string> = { low: "低", mid: "中", high: "高" };
