-- إضافة ضريبة القيمة المضافة على فواتير البيع - نفس عمودين vat_enabled/vat_rate الموجودين
-- بالفعل في جدول quotes (عروض الأسعار) بالظبط، عشان فاتورة البيع تقدر تضيف الضريبة زي عرض
-- السعر تمامًا. الفواتير القديمة (قبل التحديث ده) هتفضل vat_enabled = false تلقائيًا، يعني
-- من غير أي تغيير في أرقامها المسجلة قبل كده.
ALTER TABLE "sales_invoices" ADD COLUMN "vat_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN "vat_rate" numeric(5, 2);
