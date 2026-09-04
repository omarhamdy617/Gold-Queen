-- إضافة أعمدة جديدة: حد أقصى لقيمة العهدة لكل موظف + حماية تسجيل الدخول من محاولات الاختراق المتكررة
ALTER TABLE "consignments" ADD COLUMN IF NOT EXISTS "limit_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "locked_until" timestamp;
