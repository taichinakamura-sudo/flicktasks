import { describe, expect, it } from "vitest";
import { mockRefine, normalizeRefinement } from "./refine";

describe("normalizeRefinement", () => {
  it("JSON 文字列から整形する", () => {
    const r = normalizeRefinement(
      '{"title":" 買い物 ","steps":["牛乳を買う","卵を買う"],"priority":"HIGH"}',
      "fb",
    );
    expect(r).toEqual({ title: "買い物", steps: ["牛乳を買う", "卵を買う"], priority: "high" });
  });
  it("前後に説明文が付いていても JSON 部分を拾う", () => {
    const r = normalizeRefinement('はい、こちらです:\n{"title":"a","steps":[],"priority":"low"}\n以上', "fb");
    expect(r.title).toBe("a");
    expect(r.priority).toBe("low");
  });
  it("壊れた出力はフォールバックする", () => {
    expect(normalizeRefinement("???", "元のタイトル")).toEqual({
      title: "元のタイトル",
      steps: [],
      priority: "mid",
    });
    expect(normalizeRefinement(null, "x").title).toBe("x");
  });
  it("steps は最大 5 件・文字列のみ", () => {
    const r = normalizeRefinement(
      { title: "t", steps: ["1", 2, "3", "", "4", "5", "6", "7"], priority: "zzz" },
      "fb",
    );
    expect(r.steps).toEqual(["1", "3", "4", "5", "6"]);
    expect(r.priority).toBe("mid");
  });
});

describe("mockRefine", () => {
  it("1 行目をタイトルに、残りを手順にする", () => {
    const r = mockRefine("企画書を仕上げる\n構成を決める\n下書きを書く\nレビュー依頼 至急");
    expect(r.title).toBe("企画書を仕上げる");
    expect(r.steps).toEqual(["構成を決める", "下書きを書く", "レビュー依頼 至急"]);
    expect(r.priority).toBe("high");
  });
  it("優先度語だけの行は手順にしない", () => {
    expect(mockRefine("牛乳を買う、卵を買う、至急").steps).toEqual(["卵を買う"]);
    expect(mockRefine("いつか本を読む").priority).toBe("low");
  });
});
