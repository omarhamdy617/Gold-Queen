-- ملحوظة: الملف ده متقسم لمعاملتين (BEGIN...COMMIT) منفصلتين مش واحدة زي المرات اللي فاتت -
-- بوستجرس بيرفض استخدام قيمة جديدة على enum (زي "PENDING" الجديدة على order_status) في نفس
-- المعاملة اللي اتضافت فيها القيمة دي (لازم "تتثبّت" الأول بـ commit). عشان كده لازم نضيف القيم
-- الجديدة في معاملة، تتقفل، وبعدين نستخدمها (كـ DEFAULT على عمود) في معاملة تانية بعدها.
-- المعاملتين هيتنفذوا ورا بعض عادي لو نسخت الملف كله ولزقته في SQL Editor وشغلته مرة واحدة.

-- ================== المعاملة الأولى: إضافة القيم الجديدة على enum الحالة ==================
BEGIN;

CREATE TYPE "public"."order_attempt_result" AS ENUM('NO_ANSWER', 'WRONG_NUMBER', 'POSTPONED', 'OTHER');
ALTER TYPE "public"."order_status" ADD VALUE 'PENDING' BEFORE 'PREPARING';
ALTER TYPE "public"."order_status" ADD VALUE 'CONFIRMED' BEFORE 'PREPARING';
ALTER TYPE "public"."order_status" ADD VALUE 'CANCELLED';

COMMIT;

-- ================== المعاملة الثانية: باقي التعديلات (أعمدة جديدة + تغيير الافتراضي) ==================
BEGIN;

ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_price" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "subtotal" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_fee" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "total" numeric(14, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_by_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmation_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_attempt_result" "order_attempt_result";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_attempt_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_by_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_id_users_id_fk" FOREIGN KEY ("cancelled_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

-- ملحوظة: الأوردرات القديمة (اللي كانت مسجلة قبل التحديث ده) مالهاش سعر مسجل من الأصل (كان أصلًا
-- مش موجود في السيستم) - هتفضل ظاهرة بسعر 0 في السجل القديم، وده طبيعي وميأثرش على أي حاجة شغالة.
-- حالتها القديمة (قيد التجهيز/في الشحن/تم التسليم/مرتجع) هتفضل زي ما هي بالظبط، من غير أي تغيير.

COMMIT;
