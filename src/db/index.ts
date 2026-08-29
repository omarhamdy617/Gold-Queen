import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dbSchema from "./schema";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  throw new Error("DATABASE_URL غير موجود في متغيرات البيئة");
}

// prepare:false works with Supabase's pooled connection (pgbouncer transaction mode)
const client = postgres(connectionString, { prepare: false, max: 10 });

export const db = drizzle(client, { schema: dbSchema });
export * as schema from "./schema";
