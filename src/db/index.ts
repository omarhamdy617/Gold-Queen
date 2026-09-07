import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dbSchema from "./schema";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  throw new Error("DATABASE_URL غير موجود في متغيرات البيئة");
}

// prepare:false works with Supabase's pooled connection (pgbouncer transaction mode)
// رجّعنا max لـ 10 (كان اتقلل لـ 3 مع idle_timeout) - التعديل ده كان غلط: بطّأ النظام كله (مش
// بس صفحة الأوردرات) لأن الملف ده مستخدم في كل صفحة وكل عملية في التطبيق، وتقليل عدد الاتصالات
// المسموح بيها كان بيخلي أي صفحة بتجيب أكتر من حاجة مرة واحدة (زي الأوردرات اللي بتجيب 8 حاجات)
// تستنى دورها بدل ما تتنفذ كلها مع بعض.
const client = postgres(connectionString, { prepare: false, max: 10 });

export const db = drizzle(client, { schema: dbSchema });
export * as schema from "./schema";
