import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import helmet from "helmet";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedTopUp } from "./seed";
import "./auth"; // loads session type augmentation

if (!process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET environment variable is required. " +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
}

const PgSession = connectPgSimple(session);

const app = express();

// Trust first proxy (Apache reverse proxy terminates TLS)
// Without this, Express sees HTTP and refuses to set Secure cookies
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

app.use(express.json({ limit: "10mb" })); // cap payload size (covers receipt image uploads)
app.use(express.urlencoded({ extended: false }));

// Session store — PostgreSQL for persistence across PM2 restarts
const sessionPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PgSession({ pool: sessionPool, createTableIfMissing: true }),
    cookie: {
      secure: process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: "strict",
    },
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.includes("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Ensure demo data exists for published deployments
  try {
    await seedTopUp("all", false); // harmless after first success
  } catch (e) {
    console.error("Seed on startup failed (non-fatal):", e);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error(err);
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
