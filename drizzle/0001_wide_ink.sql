CREATE TABLE "couriers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"phone" varchar(50),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipping_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"phone" varchar(50),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "shipping_method" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "shipping_method" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_name" varchar(200) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone" varchar(50) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone2" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "governorate" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_notes" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_company_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assigned_by_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assigned_at" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "return_requests" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "return_requests" ADD COLUMN "reason_category" varchar(100);--> statement-breakpoint
ALTER TABLE "return_requests" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "company_address" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "company_phone" varchar(50);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "company_phone2" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_company_id_shipping_companies_id_fk" FOREIGN KEY ("shipping_company_id") REFERENCES "public"."shipping_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;