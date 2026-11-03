import { mockRefine, normalizeRefinement } from "../shared/refine";
import type { Refinement } from "../shared/types";

const MODEL = "@cf/meta/llama-3.1-8b-instruct" as const;

const SYSTEM = `あなたはタスク整理アシスタントです。ユーザーが書いた雑なメモを、実行しやすいタスクに整えます。
必ず次の JSON だけを返してください(説明文は不要):
{"title": "<30文字以内の簡潔なタイトル>", "steps": ["<動詞で始まる具体的な手順(最大5つ)>"], "priority": "low" | "mid" | "high"}
- 入力と同じ言語で書く
- steps はメモから読み取れる範囲で分解し、推測しすぎない
- priority は締切・緊急語があれば high、「いつか」など曖昧なら low、それ以外は mid`;

const SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    steps: { type: "array", items: { type: "string" }, maxItems: 5 },
    priority: { type: "string", enum: ["low", "mid", "high"] },
  },
  required: ["title", "steps", "priority"],
} as const;

export async function refineTask(env: Env, text: string): Promise<Refinement> {
  const fallbackTitle = text.split("\n")[0]?.trim().slice(0, 30) || text.slice(0, 30);
  if (env.MOCK_AI === "1") return mockRefine(text);
  if (!env.AI) throw new Error("AI binding is not configured");

  const result = (await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: text.slice(0, 2000) },
    ],
    response_format: { type: "json_schema", json_schema: SCHEMA },
    max_tokens: 400,
    temperature: 0.2,
  } as never)) as { response?: unknown };

  return normalizeRefinement(result?.response ?? result, fallbackTitle);
}
