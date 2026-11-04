import type { Priority, Status, Step, Task, User } from "../shared/types";

type TaskRow = {
  id: string;
  text: string;
  status: Status;
  priority: Priority | null;
  steps: string;
  estimate_min: number | null;
  actual_ms: number;
  doing_since: number | null;
  completed_at: number | null;
  created_at: number;
  updated_at: number;
};

type UserRow = { id: string; email: string; name: string | null; picture: string | null };

export function rowToTask(r: TaskRow): Task {
  let steps: Step[] = [];
  try {
    const parsed = JSON.parse(r.steps);
    if (Array.isArray(parsed)) steps = parsed;
  } catch {
    steps = [];
  }
  return {
    id: r.id,
    text: r.text,
    status: r.status,
    priority: r.priority,
    steps,
    estimateMin: r.estimate_min,
    actualMs: r.actual_ms,
    doingSince: r.doing_since,
    completedAt: r.completed_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listTasks(db: D1Database, userId: string): Promise<Task[]> {
  const { results } = await db
    .prepare("SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC")
    .bind(userId)
    .all<TaskRow>();
  return results.map(rowToTask);
}

export async function getTask(db: D1Database, userId: string, id: string): Promise<Task | null> {
  const row = await db
    .prepare("SELECT * FROM tasks WHERE user_id = ? AND id = ?")
    .bind(userId, id)
    .first<TaskRow>();
  return row ? rowToTask(row) : null;
}

export function insertTaskStmt(db: D1Database, userId: string, t: Task) {
  return db
    .prepare(
      "INSERT OR IGNORE INTO tasks (id, user_id, text, status, priority, steps, estimate_min, actual_ms, doing_since, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      t.id,
      userId,
      t.text,
      t.status,
      t.priority,
      JSON.stringify(t.steps),
      t.estimateMin,
      t.actualMs,
      t.doingSince,
      t.completedAt,
      t.createdAt,
      t.updatedAt,
    );
}

export async function updateTask(
  db: D1Database,
  userId: string,
  id: string,
  patch: Partial<
    Pick<
      Task,
      "text" | "status" | "priority" | "steps" | "estimateMin" | "actualMs" | "doingSince" | "completedAt"
    >
  >,
): Promise<Task | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.text !== undefined) {
    sets.push("text = ?");
    values.push(patch.text);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    values.push(patch.status);
  }
  if (patch.priority !== undefined) {
    sets.push("priority = ?");
    values.push(patch.priority);
  }
  if (patch.steps !== undefined) {
    sets.push("steps = ?");
    values.push(JSON.stringify(patch.steps));
  }
  if (patch.estimateMin !== undefined) {
    sets.push("estimate_min = ?");
    values.push(patch.estimateMin);
  }
  if (patch.actualMs !== undefined) {
    sets.push("actual_ms = ?");
    values.push(patch.actualMs);
  }
  if (patch.doingSince !== undefined) {
    sets.push("doing_since = ?");
    values.push(patch.doingSince);
  }
  if (patch.completedAt !== undefined) {
    sets.push("completed_at = ?");
    values.push(patch.completedAt);
  }
  const now = Date.now();
  sets.push("updated_at = ?");
  values.push(now);
  await db
    .prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE user_id = ? AND id = ?`)
    .bind(...values, userId, id)
    .run();
  return getTask(db, userId, id);
}

export async function deleteTask(db: D1Database, userId: string, id: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM tasks WHERE user_id = ? AND id = ?").bind(userId, id).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function upsertUser(
  db: D1Database,
  u: { googleSub: string; email: string; name: string | null; picture: string | null },
): Promise<User> {
  const existing = await db
    .prepare("SELECT id, email, name, picture FROM users WHERE google_sub = ?")
    .bind(u.googleSub)
    .first<UserRow>();
  if (existing) {
    await db
      .prepare("UPDATE users SET email = ?, name = ?, picture = ? WHERE id = ?")
      .bind(u.email, u.name, u.picture, existing.id)
      .run();
    return { id: existing.id, email: u.email, name: u.name, picture: u.picture };
  }
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, u.googleSub, u.email, u.name, u.picture, Date.now())
    .run();
  return { id, email: u.email, name: u.name, picture: u.picture };
}

export async function createSession(db: D1Database, userId: string, tokenHash: string, ttlMs: number) {
  const now = Date.now();
  await db
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, now + ttlMs, now)
    .run();
}

export async function getUserBySession(db: D1Database, tokenHash: string): Promise<User | null> {
  const row = await db
    .prepare(
      "SELECT u.id, u.email, u.name, u.picture FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?",
    )
    .bind(tokenHash, Date.now())
    .first<UserRow>();
  return row ?? null;
}

export async function deleteSession(db: D1Database, tokenHash: string) {
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(tokenHash).run();
}
