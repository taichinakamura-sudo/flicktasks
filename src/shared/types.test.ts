import { describe, expect, it } from "vitest";
import { nextStatus, prevStatus } from "./types";

describe("status transitions", () => {
  it("inbox → today → doing → done → (end)", () => {
    expect(nextStatus("inbox")).toBe("today");
    expect(nextStatus("today")).toBe("doing");
    expect(nextStatus("doing")).toBe("done");
    expect(nextStatus("done")).toBeNull();
  });
  it("done → doing → today → inbox → (end)", () => {
    expect(prevStatus("done")).toBe("doing");
    expect(prevStatus("doing")).toBe("today");
    expect(prevStatus("today")).toBe("inbox");
    expect(prevStatus("inbox")).toBeNull();
  });
});
