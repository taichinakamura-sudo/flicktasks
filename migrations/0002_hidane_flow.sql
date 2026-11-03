-- hidane-flow: 4段ステータス(inbox/today/doing/done)と予実フィールドを追加。
-- SQLiteはCHECK制約をALTERできないためテーブルを作り直す。
-- 旧仕様の 'doing'(進行中・複数可) は新仕様の 'doing'(今から・最大1件) と意味が違うため、
-- 既存の doing は全件 'today' に変換する(どれかを勝手にフォーカス枠へ昇格させない)。

CREATE TABLE tasks_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('inbox', 'today', 'doing', 'done')),
  priority TEXT CHECK (priority IN ('low', 'mid', 'high')),
  steps TEXT NOT NULL DEFAULT '[]',
  estimate_min INTEGER,
  actual_ms INTEGER NOT NULL DEFAULT 0,
  doing_since INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO tasks_new (id, user_id, text, status, priority, steps, created_at, updated_at)
SELECT
  id,
  user_id,
  text,
  CASE WHEN status = 'doing' THEN 'today' ELSE status END,
  priority,
  steps,
  created_at,
  updated_at
FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status, created_at DESC);
