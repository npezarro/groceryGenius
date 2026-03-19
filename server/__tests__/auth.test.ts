import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "../auth";

describe("hashPassword", () => {
  it("returns a string in hash.salt format", async () => {
    const result = await hashPassword("mypassword");
    const parts = result.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0); // hash
    expect(parts[1].length).toBe(32); // 16 bytes hex = 32 chars
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const hash1 = await hashPassword("samepassword");
    const hash2 = await hashPassword("samepassword");
    expect(hash1).not.toBe(hash2);
  });

  it("hash portion is 128 hex chars (64 bytes)", async () => {
    const result = await hashPassword("test");
    const [hash] = result.split(".");
    expect(hash.length).toBe(128);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("returns true for correct password", async () => {
    const stored = await hashPassword("correctpassword");
    const result = await verifyPassword(stored, "correctpassword");
    expect(result).toBe(true);
  });

  it("returns false for wrong password", async () => {
    const stored = await hashPassword("correctpassword");
    const result = await verifyPassword(stored, "wrongpassword");
    expect(result).toBe(false);
  });

  it("returns false for malformed stored hash (no dot)", async () => {
    const result = await verifyPassword("nodotseparator", "anything");
    expect(result).toBe(false);
  });

  it("returns false for empty stored hash", async () => {
    const result = await verifyPassword(".", "anything");
    expect(result).toBe(false);
  });

  it("handles empty password input", async () => {
    const stored = await hashPassword("notempty");
    const result = await verifyPassword(stored, "");
    expect(result).toBe(false);
  });

  it("verifies passwords with special characters", async () => {
    const password = "p@$$w0rd!#%^&*()_+{}|:<>?~`";
    const stored = await hashPassword(password);
    expect(await verifyPassword(stored, password)).toBe(true);
  });

  it("verifies passwords with unicode", async () => {
    const password = "密码пароль🔑";
    const stored = await hashPassword(password);
    expect(await verifyPassword(stored, password)).toBe(true);
  });
});
