import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Request, Response, NextFunction } from "express";
import "express-session";
import { storage } from "./storage";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function verifyPassword(stored: string, supplied: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(Buffer.from(hashed, "hex"), buf);
}

const ADMIN_EMAIL = "n.pezarro@gmail.com";

/** Check if a user object has admin privileges */
export function isAdmin(user: { email?: string | null; role?: string | null } | null): boolean {
  if (!user) return false;
  return user.role === "admin" || user.email === ADMIN_EMAIL;
}

/** Returns the admin email for role assignment checks */
export function getAdminEmail(): string {
  return ADMIN_EMAIL;
}

/** Express middleware that rejects unauthenticated requests */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

/** Express middleware that rejects non-admin requests */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!isAdmin(user ?? null)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  if (!user?.emailVerified) {
    return res.status(403).json({ error: "Email verification required", code: "EMAIL_NOT_VERIFIED" });
  }
  next();
}
