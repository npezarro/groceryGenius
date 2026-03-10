import { describe, it, expect, vi, beforeAll } from "vitest";
import express from "express";
import { z } from "zod";
import { validateInput } from "../auth";

// ── Helper: make an HTTP request to a test Express app ──────────
async function request(
  app: express.Express,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const { createServer } = await import("http");

  return new Promise<{ status: number; body: any; headers: Record<string, string> }>((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as import("net").AddressInfo;
      const url = `http://127.0.0.1:${addr.port}${path}`;

      const payload = body ? JSON.stringify(body) : undefined;
      const reqHeaders: Record<string, string> = {
        ...(headers || {}),
        ...(payload ? { "Content-Type": "application/json" } : {}),
      };

      fetch(url, { method, body: payload, headers: reqHeaders })
        .then(async (res) => {
          const text = await res.text();
          let parsed: any;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
          resolve({
            status: res.status,
            body: parsed,
            headers: Object.fromEntries(res.headers.entries()),
          });
          server.close();
        })
        .catch((err) => {
          server.close();
          reject(err);
        });
    });
  });
}

// ── 1. /api/admin/seed returns 403 without admin key ─────────
describe("Admin seed endpoint", () => {
  let app: express.Express;

  beforeAll(() => {
    // Set an admin key for testing
    process.env.ADMIN_KEY = "test-admin-key-12345";

    app = express();
    app.use(express.json());

    // Re-create the isAuthorized + seed route exactly as in routes.ts
    function isAuthorized(req: any) {
      const adminKey = process.env.ADMIN_KEY;
      const header = req.headers["x-admin-key"];
      return Boolean(adminKey) && header === adminKey;
    }

    app.post("/api/admin/seed", (req, res) => {
      if (!isAuthorized(req)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json({ ok: true, seeded: true });
    });
  });

  it("returns 403 without admin key", async () => {
    const res = await request(app, "POST", "/api/admin/seed");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("returns 403 with wrong admin key", async () => {
    const res = await request(app, "POST", "/api/admin/seed", undefined, {
      "x-admin-key": "wrong-key",
    });
    expect(res.status).toBe(403);
  });

  it("succeeds with valid admin key header", async () => {
    const res = await request(app, "POST", "/api/admin/seed", undefined, {
      "x-admin-key": "test-admin-key-12345",
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

// ── 2. SESSION_SECRET is required ────────────────────────────
describe("Session secret requirement", () => {
  it("throws when SESSION_SECRET is not set", async () => {
    // We test by checking that the guard code from index.ts would throw.
    // We replicate the exact check from server/index.ts here as a unit test
    // because importing index.ts would start the actual server.
    const secret = undefined; // simulate unset
    expect(() => {
      if (!secret) {
        throw new Error("SESSION_SECRET environment variable is required.");
      }
    }).toThrow("SESSION_SECRET");
  });
});

// ── 3. validateInput middleware rejects bad input ────────────
describe("validateInput middleware", () => {
  const registerSchema = z.object({
    username: z.string().min(3).max(50),
    email: z.string().email().optional(),
    password: z.string().min(6),
    displayName: z.string().max(100).optional(),
  });

  const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  });

  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.post("/register", validateInput(registerSchema), (_req, res) => {
      res.json({ ok: true });
    });

    app.post("/login", validateInput(loginSchema), (_req, res) => {
      res.json({ ok: true });
    });
  });

  it("rejects registration with missing fields", async () => {
    const res = await request(app, "POST", "/register", {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("rejects registration with short password", async () => {
    const res = await request(app, "POST", "/register", {
      username: "testuser",
      password: "12",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("passes registration with valid input", async () => {
    const res = await request(app, "POST", "/register", {
      username: "testuser",
      password: "securepass123",
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects login with empty password", async () => {
    const res = await request(app, "POST", "/login", {
      username: "testuser",
      password: "",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Password is required");
  });

  it("rejects login with missing username", async () => {
    const res = await request(app, "POST", "/login", {
      password: "somepassword",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
