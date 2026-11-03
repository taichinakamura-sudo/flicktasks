import type { Priority, Refinement } from "./types";

const HIGH = /至急|急ぎ|今日|締切|締め切り|deadline|asap|urgent|today/i;
const LOW = /いつか|暇な|そのうち|someday|later|メモ程度/i;

/** AI 出力(文字列 or オブジェクト)を安全に Refinement に正規化する */
export function normalizeRefinement(raw: unknown, fallbackTitle: string): Refinement {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        obj = JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        obj = {};
      }
    }
  } else if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  const title =
    typeof obj.title === "string" && obj.title.trim() ? obj.title.trim().slice(0, 60) : fallbackTitle;
  const steps = Array.isArray(obj.steps)
    ? obj.steps
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 80))
        .slice(0, 5)
    : [];
  const p = typeof obj.priority === "string" ? obj.priority.toLowerCase() : "";
  const priority: Priority = p === "high" || p === "low" || p === "mid" ? p : "mid";
  return { title, steps, priority };
}

/** Workers AI を使わない決定的なモック(E2E / ローカル用) */
export function mockRefine(text: string): Refinement {
  const lines = text
    .split(/\n|。|、|,|;|・/)
    .map((s) => s.trim())
    .filter(Boolean);
  const title = (lines[0] ?? text).slice(0, 30);
  const steps = (lines.length > 1 ? lines.slice(1) : lines)
    .filter((l) => !/^(至急|急ぎ|今日|いつか|そのうち|asap|urgent|today)$/i.test(l))
    .slice(0, 5);
  const priority: Priority = HIGH.test(text) ? "high" : LOW.test(text) ? "low" : "mid";
  return { title, steps, priority };
}
