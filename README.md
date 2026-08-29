# جولد كوين — نظام المبيعات والمخازن والحسابات والتجار

Next.js 16 (App Router) + Drizzle ORM + PostgreSQL. عربي RTL بالكامل.

## التقنيات
- Next.js (Server Actions + Route Handlers)
- Drizzle ORM على PostgreSQL (مُختبر مع Supabase)
- جلسات JWT في كوكيز httpOnly (بدون اعتماد على خدمة خارجية)
- ExcelJS / PDFKit للتصدير، JsBarcode + canvas لطباعة الباركود

## خطوات النشر (Vercel + Supabase)

### 1) قاعدة البيانات على Supabase
1. أنشئ مشروع جديد على supabase.com.
2. من Project Settings → Database → Connection string، انسخ:
   - **Transaction pooler** (بورت 6543) → `DATABASE_URL`
   - **Session pooler / Direct** (بورت 5432) → `DIRECT_URL`
3. (اختياري للنسخ الاحتياطي التلقائي) أنشئ Storage bucket اسمه `backups`، وخد الـ `SUPABASE_URL` و`service_role key` من Project Settings → API.

### 2) تجهيز الجداول
```bash
npm install
cp .env.example .env.local   # واملأ القيم
npm run db:generate          # (تم توليدها بالفعل في مجلد drizzle/)
npm run db:migrate           # ينشئ كل الجداول على قاعدة البيانات الحقيقية
npm run db:seed              # يُنشئ حساب الأدمن الأول + الأدوار + طرق الدفع + المحل والمخزن
```
بعد التشغيل هتلاقي في الطرفية اسم المستخدم وكلمة مرور الأدمن الأول (افتراضيًا admin / القيمة اللي حطيتها في SEED_ADMIN_PASSWORD). **غيّرها فورًا بعد أول دخول من شاشة المستخدمين.**

### 3) النشر على Vercel
1. ادفع الكود لمستودع GitHub.
2. من Vercel: New Project → اختر المستودع.
3. أضف نفس متغيرات البيئة من `.env.example` في Vercel Project Settings → Environment Variables.
4. Deploy. مفيش أي إعداد إضافي مطلوب — `vercel.json` فيه بالفعل جدولة النسخة الاحتياطية اليومية (Cron).

### 4) بعد أول نشر
- سجّل دخول بحساب الأدمن، وغيّر الباسورد.
- من الإعدادات: أضف موظفينك وحدد صلاحياتهم بالتفصيل.
- من الإعدادات: راجع طرق الدفع (كاش/فودافون كاش/إنستا باي/تحويل بنكي) والمحل/المخزن الافتراضيين وعدّلهم لو حابب.
- ابدأ تسجيل منتجاتك (المنتجات والمخزون).

## هيكل المشروع
- `src/db/schema.ts` — كل جداول قاعدة البيانات (33 جدول).
- `src/lib/auth.ts` — الجلسات، الصلاحيات، سجل التدقيق.
- `src/lib/permissions.ts` — كل مفاتيح الصلاحيات وصلاحيات الأدوار الافتراضية.
- `src/lib/ops.ts` — عمليات محاسبية مشتركة (خزينة، مخزون، متوسط تكلفة) تعمل جوه transactions لضمان التزامن.
- `src/actions/*` — Server Actions لكل وحدة (مبيعات، مشتريات، عملاء...).
- `src/app/(app)/*` — كل شاشات النظام بعد تسجيل الدخول.
- `src/app/api/orders/webhook` — نقطة جاهزة لاستقبال أوردرات من موقع أونلاين مستقبلي (حماية بـ `ORDERS_WEBHOOK_SECRET`).
- `src/app/api/backup` و`src/app/api/cron/backup` — نسخ احتياطي يدوي ودوري.

## ملاحظة عن التزامن
كل العمليات المالية والمخزنية (بيع، شراء، تحويل، مرتجع) بتتنفذ جوه `db.transaction` مع قفل صفوف (`FOR UPDATE`) على الخزينة/المخزون/رصيد العميل، فمينفعش عمليتين في نفس اللحظة يعملوا "double booking" حتى لو مستخدمين مختلفين بيشتغلوا في نفس الثانية من أجهزة مختلفة.
