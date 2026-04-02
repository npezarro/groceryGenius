import { describe, it, expect } from "vitest";
import { escapeLikePattern } from "../lib/escape-like";

describe("escapeLikePattern", () => {
  it("returns plain text unchanged", () => {
    expect(escapeLikePattern("milk")).toBe("milk");
  });

  it("escapes percent wildcard", () => {
    expect(escapeLikePattern("100%")).toBe("100\\%");
  });

  it("escapes underscore wildcard", () => {
    expect(escapeLikePattern("item_1")).toBe("item\\_1");
  });

  it("escapes backslash (the escape character itself)", () => {
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
  });

  it("escapes multiple wildcards in one string", () => {
    expect(escapeLikePattern("%_both_%")).toBe("\\%\\_both\\_\\%");
  });

  it("handles empty string", () => {
    expect(escapeLikePattern("")).toBe("");
  });

  it("preserves spaces and normal punctuation", () => {
    expect(escapeLikePattern("organic (2lb)")).toBe("organic (2lb)");
  });

  it("handles string of only wildcards", () => {
    expect(escapeLikePattern("%%__")).toBe("\\%\\%\\_\\_");
  });
});
