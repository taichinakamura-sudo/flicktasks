import { describe, expect, it } from "vitest";
import { decodeBase64url, randomToken, sha256, sign, verifySigned } from "./crypto";

describe("crypto helpers", () => {
  it("署名付き値を検証できる / 改ざんは弾く", async () => {
    const signed = await sign("state.verifier", "secret");
    expect(await verifySigned(signed, "secret")).toBe("state.verifier");
    expect(await verifySigned(signed, "other")).toBeNull();
    expect(await verifySigned(`${signed}x`, "secret")).toBeNull();
    expect(await verifySigned("nodot", "secret")).toBeNull();
  });
  it("randomToken は URL セーフで十分な長さ", () => {
    const t = randomToken(32);
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(32)).not.toBe(t);
  });
  it("sha256 は決定的 / base64url デコードは UTF-8 を扱う", async () => {
    expect(await sha256("a")).toBe(await sha256("a"));
    expect(await sha256("a")).not.toBe(await sha256("b"));
    expect(decodeBase64url("44GT44KT44Gr44Gh44Gv")).toBe("こんにちは");
  });
});
