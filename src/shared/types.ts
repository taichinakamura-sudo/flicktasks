export const STATUSES = ["inbox", "doing", "done"] as const;
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
  createdAt: number;
  updatedAt: number;
};

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
  doing: "進行中",
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
