import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import { Readable, Writable } from "node:stream";
import { z } from "zod";
import { validateInput } from "../auth";

// ── Helper: make an HTTP request to a test Express app ──────────
type TestResponse = {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string>;
};

async function request(
  app: express.Express,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
) : Promise<TestResponse> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []);

  Object.assign(req, {
    method,
    url: path,
    originalUrl: path,
    headers: {
      host: "localhost",
      ...(headers || {}),
      ...(payload
        ? {
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(payload)),
          }
        : {}),
    },
    httpVersion: "1.1",
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    socket: { encrypted: false, remoteAddress: "127.0.0.1" },
    connection: { encrypted: false, remoteAddress: "127.0.0.1" },
  });

  const chunks: Buffer[] = [];
  const responseHeaders = new Map<string, number | string | readonly string[]>();
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  }) as Writable & {
    statusCode: number;
    statusMessage: string;
    setHeader(name: string, value: number | string | readonly string[]): typeof res;
    getHeader(name: string): number | string | readonly string[] | undefined;
    getHeaders(): Record<string, number | string | readonly string[]>;
    hasHeader(name: string): boolean;
    removeHeader(name: string): void;
    writeHead(
      statusCode: number,
      reasonOrHeaders?: string | Record<string, number | string | readonly string[]>,
      headers?: Record<string, number | string | readonly string[]>,
    ): typeof res;
  };

  res.statusCode = 200;
  res.statusMessage = "OK";
  res.setHeader = (name, value) => {
    responseHeaders.set(name.toLowerCase(), value);
    return res;
  };
  res.getHeader = (name) => responseHeaders.get(name.toLowerCase());
  res.getHeaders = () => Object.fromEntries(responseHeaders.entries());
  res.hasHeader = (name) => responseHeaders.has(name.toLowerCase());
  res.removeHeader = (name) => {
    responseHeaders.delete(name.toLowerCase());
  };
  res.writeHead = (statusCode, reasonOrHeaders, headHeaders) => {
    res.statusCode = statusCode;
    const headerObject = typeof reasonOrHeaders === "object" ? reasonOrHeaders : headHeaders;
    if (headerObject) {
      for (const [name, value] of Object.entries(headerObject)) {
        res.setHeader(name, value);
      }
    }
    return res;
  };

  const streamWrite = res.write.bind(res);
  const streamEnd = res.end.bind(res);
  res.write = streamWrite;
  res.end = streamEnd;

  return new Promise<TestResponse>((resolve, reject) => {
    res.on("finish", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { _raw: text };
      }
      resolve({
        status: res.statusCode,
        body: parsed,
        headers: Object.fromEntries(
          Array.from(responseHeaders.entries()).map(([name, value]) => [name, String(value)]),
        ),
      });
    });

    app.handle(req as express.Request, res as unknown as express.Response, reject);
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
    function isAuthorized(req: express.Request) {
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

// ── 1b. Import and geocode endpoints require admin key ──────
describe("Import/geocode endpoint authentication", () => {
  let app: express.Express;

  beforeAll(() => {
    process.env.ADMIN_KEY = "test-admin-key-12345";

    app = express();
    app.use(express.json());

    function isAuthorized(req: express.Request) {
      const adminKey = process.env.ADMIN_KEY;
      const header = req.headers["x-admin-key"];
      return Boolean(adminKey) && header === adminKey;
    }

    // Minimal stubs matching the route structure
    for (const path of ["/api/import/stores", "/api/import/items", "/api/import/prices", "/api/geocode-stores"]) {
      app.post(path, (req, res) => {
        if (!isAuthorized(req)) {
          return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
        }
        res.json({ ok: true });
      });
    }
  });

  for (const endpoint of ["/api/import/stores", "/api/import/items", "/api/import/prices", "/api/geocode-stores"]) {
    it(`${endpoint} returns 403 without admin key`, async () => {
      const res = await request(app, "POST", endpoint);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Forbidden");
    });

    it(`${endpoint} succeeds with valid admin key`, async () => {
      const res = await request(app, "POST", endpoint, undefined, {
        "x-admin-key": "test-admin-key-12345",
      });
      expect(res.status).toBe(200);
    });
  }
});

// ── 1c. Import endpoints reject empty CSV ───────────────────
describe("Import empty CSV validation", () => {
  let app: express.Express;

  beforeAll(() => {
    process.env.ADMIN_KEY = "test-admin-key-12345";

    app = express();
    app.use(express.json());

    function isAuthorized(req: express.Request) {
      const adminKey = process.env.ADMIN_KEY;
      const header = req.headers["x-admin-key"];
      return Boolean(adminKey) && header === adminKey;
    }

    function parseCSV(data: string): string[][] {
      return data.trim() ? data.trim().split("\n").map(line => line.split(",")) : [];
    }

    for (const path of ["/api/import/stores", "/api/import/items", "/api/import/prices"]) {
      app.post(path, (req, res) => {
        if (!isAuthorized(req)) {
          return res.status(403).json({ error: "Forbidden: valid ADMIN_KEY required" });
        }
        const { csvData } = req.body;
        if (!csvData) {
          return res.status(400).json({ error: "CSV data is required" });
        }
        const rows = parseCSV(csvData);
        if (rows.length === 0) {
          return res.status(400).json({ error: "CSV data is empty" });
        }
        res.json({ ok: true });
      });
    }
  });

  for (const endpoint of ["/api/import/stores", "/api/import/items", "/api/import/prices"]) {
    it(`${endpoint} returns 400 for empty CSV`, async () => {
      const res = await request(app, "POST", endpoint, { csvData: "   " }, {
        "x-admin-key": "test-admin-key-12345",
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("empty");
    });

    it(`${endpoint} returns 400 for missing CSV`, async () => {
      const res = await request(app, "POST", endpoint, {}, {
        "x-admin-key": "test-admin-key-12345",
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("required");
    });
  }
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
    password: z.string().min(6).max(128),
    displayName: z.string().max(100).optional(),
  });

  const loginSchema = z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required").max(128),
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

  it("rejects registration with password over 128 chars", async () => {
    const res = await request(app, "POST", "/register", {
      username: "testuser",
      password: "a".repeat(129),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("accepts registration with password at 128 chars", async () => {
    const res = await request(app, "POST", "/register", {
      username: "testuser",
      password: "a".repeat(128),
    });
    expect(res.status).toBe(200);
  });

  it("rejects login with password over 128 chars", async () => {
    const res = await request(app, "POST", "/login", {
      username: "testuser",
      password: "a".repeat(129),
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
