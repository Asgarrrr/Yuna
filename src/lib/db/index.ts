import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.SUPABASE_DATABASE_POOLER_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_POOLER_URL environment variable is not set");
}

const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle> };

export const db = globalForDb.db ?? drizzle(postgres(connectionString, { prepare: false }));

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
