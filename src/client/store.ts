import { create } from "zustand";
import type { Priority, Status, Step, Task, User } from "../shared/types";
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
  updateTask: (id: string, patch: Partial<Pick<Task, "text" | "status" | "priority" | "steps">>) => void;
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
    return { ownerId: p.ownerId ?? null, tasks: Array.isArray(p.tasks) ? p.tasks : [] };
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
      set({ tasks: sortTasks(local.tasks), ownerId: local.ownerId });

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
          set({ user, ownerId: user.id, tasks: sortTasks(tasks) });
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
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({ tasks: [task, ...s.tasks], filter: "inbox" }));
      remote(() => api.createTask(task));
      return task;
    },

    updateTask: (id, patch) => {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t)),
      }));
      remote(() => api.updateTask(id, patch));
    },

    flick: (id, dir) => {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return false;
      const order: Status[] = ["inbox", "doing", "done"];
      const next = order[order.indexOf(task.status) + dir];
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
        set((s) => ({ tasks: sortTasks([task, ...s.tasks]) }));
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
