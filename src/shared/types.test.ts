import { describe, expect, it } from "vitest";
import { nextStatus, prevStatus } from "./types";

describe("status transitions", () => {
  it("inbox → doing → done → (end)", () => {
    expect(nextStatus("inbox")).toBe("doing");
    expect(nextStatus("doing")).toBe("done");
    expect(nextStatus("done")).toBeNull();
  });
  it("done → doing → inbox → (end)", () => {
    expect(prevStatus("done")).toBe("doing");
    expect(prevStatus("doing")).toBe("inbox");
    expect(prevStatus("inbox")).toBeNull();
  });
});
