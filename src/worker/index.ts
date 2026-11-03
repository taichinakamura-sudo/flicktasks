import { Hono } from "hono";
import { z } from "zod";
import { PRIORITIES, STATUSES, type Task } from "../shared/types";
import { refineTask } from "./ai";
import { type AppEnv, auth, currentUser } from "./auth";
import { deleteTask, insertTaskStmt, listTasks, updateTask } from "./db";

const app = new Hono<AppEnv>();

const stepSchema = z.object({ text: z.string().min(1).max(200), done: z.boolean() });
const taskInput = z.object({
  id: z.uuid().optional(),
  text: z.string().trim().min(1).max(2000),
  status: z.enum(STATUSES).default("inbox"),
  priority: z.enum(PRIORITIES).nullable().default(null),
  steps: z.array(stepSchema).max(20).default([]),
  createdAt: z.number().int().optional(),
});
const taskPatch = z
  .object({
    text: z.string().trim().min(1).max(2000),
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES).nullable(),
    steps: z.array(stepSchema).max(20),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "empty patch");

app.use("*", async (c, next) => {
  c.set("user", await currentUser(c.env, c.req.header("cookie")));
  await next();
});

app.route("/auth", auth);

app.get("/api/me", (c) => c.json({ user: c.get("user") }));

const api = new Hono<AppEnv>();
api.use("*", async (c, next) => {
  if (!c.get("user")) return c.json({ error: "unauthorized" }, 401);
  await next();
});

api.get("/tasks", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  return c.json({ tasks: await listTasks(c.env.DB, user.id) });
});

function toTask(input: z.infer<typeof taskInput>): Task {
  const now = Date.now();
  return {
    id: input.id ?? crypto.randomUUID(),
    text: input.text,
    status: input.status,
    priority: input.priority,
    steps: input.steps,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}

api.post("/tasks", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = taskInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
  const task = toTask(parsed.data);
  await insertTaskStmt(c.env.DB, user.id, task).run();
  return c.json({ task }, 201);
});

/** ゲスト(未ログイン)時にローカル保存していたタスクをまとめて取り込む */
api.post("/tasks/import", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = z
    .object({ tasks: z.array(taskInput).max(500) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
  const tasks = parsed.data.tasks.map(toTask);
  if (tasks.length > 0) await c.env.DB.batch(tasks.map((t) => insertTaskStmt(c.env.DB, user.id, t)));
  return c.json({ tasks: await listTasks(c.env.DB, user.id) });
});

api.patch("/tasks/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const parsed = taskPatch.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
  const task = await updateTask(c.env.DB, user.id, c.req.param("id"), parsed.data);
  if (!task) return c.json({ error: "not_found" }, 404);
  return c.json({ task });
});

api.delete("/tasks/:id", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthorized" }, 401);
  const ok = await deleteTask(c.env.DB, user.id, c.req.param("id"));
  return ok ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
});

/** Workers AI でメモを「タイトル / 手順 / 優先度」に整理する */
api.post("/ai/refine", async (c) => {
  const parsed = z
    .object({ text: z.string().trim().min(1).max(2000) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "invalid" }, 400);
  try {
    return c.json({ refinement: await refineTask(c.env, parsed.data.text) });
  } catch (e) {
    console.error("ai/refine failed", e);
    return c.json({ error: "ai_unavailable" }, 503);
  }
});

app.route("/api", api);

app.notFound((c) => c.json({ error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "internal" }, 500);
});

export default app;
