import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isLocalDb = process.env.DATABASE_URL.includes('127.0.0.1') || process.env.DATABASE_URL.includes('localhost');

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
});
export const db = drizzle(pool, { schema });
