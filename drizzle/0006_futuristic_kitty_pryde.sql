-- بيضيف: تأكيد استلام إلكتروني لكل صنف عهدة (مين أكد وإمتى) + index لتسريع شاشة تفاصيل العهدة
ALTER TABLE "consignment_items" ADD COLUMN "received_confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "consignment_items" ADD COLUMN "received_confirmed_by_id" text;--> statement-breakpoint
ALTER TABLE "consignment_items" ADD CONSTRAINT "consignment_items_received_confirmed_by_id_users_id_fk" FOREIGN KEY ("received_confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consign_item_consignment_idx" ON "consignment_items" USING btree ("consignment_id");