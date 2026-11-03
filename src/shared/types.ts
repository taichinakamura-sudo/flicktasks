export const STATUSES = ["inbox", "today", "doing", "done"] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ["low", "mid", "high"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type Step = { text: string; done: boolean };

export type Task = {
  id: string;
  text: string;
  status: Status;
  priority: Priority | null;
  steps: Step[];
  estimateMin: number | null; // 見積もり分。null = 未設定
  actualMs: number; // 実測の累計ミリ秒(doing滞在時間の自動計測)
  doingSince: number | null; // doingに入った時刻。doing以外ではnull
  completedAt: number | null; // doneに入った時刻。done以外ではnull
  createdAt: number;
  updatedAt: number;
};

export const ESTIMATE_CHIPS = [15, 30, 60, 90] as const;

export type User = {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
};

export type Refinement = {
  title: string;
  steps: string[];
  priority: Priority;
};

export const STATUS_LABEL: Record<Status, string> = {
  inbox: "メモ",
  today: "今日",
  doing: "今から",
  done: "完了",
};

export function nextStatus(s: Status): Status | null {
  const i = STATUSES.indexOf(s);
  return i < STATUSES.length - 1 ? STATUSES[i + 1] : null;
}

export function prevStatus(s: Status): Status | null {
  const i = STATUSES.indexOf(s);
  return i > 0 ? STATUSES[i - 1] : null;
}
