import type { Refinement, Task, TaskPatch, User } from "../shared/types";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 10000);
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      signal: ctrl.signal,
      ...init,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = ((await res.json()) as { error?: string }).error ?? msg;
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, msg);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  me: () => request<{ user: User | null }>("/api/me", { timeoutMs: 5000 }),
  listTasks: () => request<{ tasks: Task[] }>("/api/tasks"),
  createTask: (task: Task) =>
    request<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(task) }),
  importTasks: (tasks: Task[]) =>
    request<{ tasks: Task[] }>("/api/tasks/import", { method: "POST", body: JSON.stringify({ tasks }) }),
  updateTask: (id: string, patch: TaskPatch) =>
    request<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteTask: (id: string) => request<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),
  refine: (text: string) =>
    request<{ refinement: Refinement }>("/api/ai/refine", {
      method: "POST",
      body: JSON.stringify({ text }),
      timeoutMs: 30000,
    }),
  logout: () => request<{ ok: true }>("/auth/logout", { method: "POST" }),
};
