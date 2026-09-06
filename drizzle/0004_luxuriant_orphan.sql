-- ملحوظة: الملف كله متلف في transaction واحدة (BEGIN...COMMIT) - لو أي سطر فيه فشل، كل حاجة قبله
-- في نفس الملف هترجع زي ما كانت تلقائيًا (مفيش تطبيق جزئي نص شغال)، وهتاخد رسالة الخطأ بالظبط
-- تقدر تبعتهالي لو حصل.
BEGIN;

CREATE TYPE "public"."loan_tx_type" AS ENUM('LOAN_GIVEN', 'LOAN_TAKEN', 'REPAYMENT_RECEIVED', 'REPAYMENT_PAID');--> statement-breakpoint
ALTER TYPE "public"."cash_tx_type" ADD VALUE 'LOAN_OUT';--> statement-breakpoint
ALTER TYPE "public"."cash_tx_type" ADD VALUE 'LOAN_IN';--> statement-breakpoint
CREATE TABLE "loan_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"phone" varchar(50),
	"notes" text,
	"balance" numeric(14, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"loan_account_id" text NOT NULL,
	"type" "loan_tx_type" NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"payment_method_id" text,
	"note" text,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_lockouts" (
	"id" text PRIMARY KEY NOT NULL,
	"username_key" varchar(100) NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "login_lockouts_username_key_unique" UNIQUE("username_key")
);
--> statement-breakpoint
ALTER TABLE "consignment_items" ADD COLUMN "sold_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "min_selling_price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN "sold_by_id" text;--> statement-breakpoint
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_loan_account_id_loan_accounts_id_fk" FOREIGN KEY ("loan_account_id") REFERENCES "public"."loan_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_transactions" ADD CONSTRAINT "loan_transactions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loan_tx_account_idx" ON "loan_transactions" USING btree ("loan_account_id");--> statement-breakpoint
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."purchase_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_serials" ADD CONSTRAINT "product_serials_invoice_item_id_sales_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."sales_invoice_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_sold_by_id_users_id_fk" FOREIGN KEY ("sold_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignments" ADD CONSTRAINT "consignments_holder_id_unique" UNIQUE("holder_id");--> statement-breakpoint

-- لو في أي رصيد مخزون سالب متسجل غلط من زمان (قبل ما نضيف الحماية دي)، لازم نصفره الأول وإلا
-- سطر الـ CHECK اللي جاي هيفشل كامل ويرجع كل الملف (البضاعة الفعلية متعرفش تبقى سالبة أصلًا)
UPDATE "stocks" SET "quantity" = 0 WHERE "quantity" < 0;--> statement-breakpoint
ALTER TABLE "stocks" ADD CONSTRAINT "stock_qty_nonneg" CHECK ("stocks"."quantity" >= 0);--> statement-breakpoint

-- تعبئة sold_by_id للفواتير القديمة اللي اتسجلت قبل إضافة العمود ده - بنفترض إن البايع الفعلي
-- هو نفسه اللي سجّل الفاتورة (created_by_id) لأي فاتورة قديمة، عشان "أداء الموظفين" في الداشبورد
-- ميفقدش بيانات الفواتير القديمة دي (هتفضل غير محسوبة لو العمود فضل NULL)
UPDATE "sales_invoices" SET "sold_by_id" = "created_by_id" WHERE "sold_by_id" IS NULL;

COMMIT;