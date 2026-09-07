import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as dbSchema from "./schema";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  throw new Error("DATABASE_URL غير موجود في متغيرات البيئة");
}

// prepare:false works with Supabase's pooled connection (pgbouncer transaction mode)
//
// - max: 3 (كان 10) - كل نسخة سيرفر شغالة بتاخد لنفسها لحد "max" اتصال مع قاعدة البيانات مرة
//   واحدة، فكل ما الرقم يكبر كل ما احتمال ضرب حد الاتصالات المسموح بيه من Supabase يزيد.
// - idle_timeout: 20 - ده الجزء اللي بيحل مشكلة "Connection closed" اللي بتظهر لموظف واحد لوحده
//   من غير أي زحمة استخدام: Supabase (pgbouncer) بيقفل من عنده أي اتصال فاضل من غير استخدام لمدة
//   أطول من 60 ثانية، لكن السيرفر عندنا (لو النسخة فضلت "دافية" بين طلب وطلب على Vercel) كان
//   محتفظ بنفس الاتصال القديم من غير ما يعرف إنه اتقفل من عند Supabase - فأول استعلام يستخدمه
//   بعد فترة سكون كان بيفشل بإيرور "الاتصال اتقفل". بجعل السيرفر يقفل الاتصال الفاضل بنفسه بعد 20
//   ثانية فقط (أقل من الـ 60 ثانية بتاعة Supabase)، بيتكون اتصال جديد سليم تلقائيًا بدل ما يستخدم
//   واحد ميت من غير ما يحس.
const client = postgres(connectionString, { prepare: false, max: 3, idle_timeout: 20 });

export const db = drizzle(client, { schema: dbSchema });
export * as schema from "./schema";
