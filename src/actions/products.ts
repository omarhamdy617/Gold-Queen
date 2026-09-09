"use server";
import { db, schema } from "@/db";
import { eq, and, sql, ilike, or, gte, lte } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auth";
import { toActionError } from "@/lib/actionError";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";

export async function listCategories() {
  // كانت من غير أي تحقق تسجيل دخول خالص - أي حد عنده الرابط يقدر يشوف قائمة الفئات من غير ما يكون مسجل دخول
  await requirePermission("products.view");
  return db.select().from(schema.categories);
}

export async function createCategory(data: { name: string; requiresSerial: boolean; defaultWarrantyMonths?: number }) {
  try {
    await requirePermission("products.manage");
    if (!data.name?.trim()) throw new Error("اسم الفئة مطلوب");
    const [cat] = await db.insert(schema.categories).values(data).returning();
    revalidatePath("/products");
    return cat;
  } catch (e) {
    // قبل كده كان بينفذ db.insert مباشرة من غير try/catch - اسم فئة مكرر (unique) كان بيرجع
    // خطأ خام من قاعدة البيانات بدل رسالة عربية مفهومة
    return toActionError(e, "تعذر إضافة الفئة - يمكن الاسم ده مستخدم بالفعل لفئة تانية");
  }
}

export async function listLocations() {
  await requirePermission("products.view");
  return db.select().from(schema.locations);
}

export async function createLocation(name: string, type: "SHOP" | "WAREHOUSE" | "OTHER") {
  try {
    await requirePermission("settings.manage");
    if (!name?.trim()) throw new Error("اسم المكان مطلوب");
    const [loc] = await db.insert(schema.locations).values({ name, type }).returning();
    revalidatePath("/products");
    return loc;
  } catch (e) {
    return toActionError(e, "تعذر إضافة المكان - يمكن الاسم ده مستخدم بالفعل لمكان تاني");
  }
}

// تعديل اسم/نوع الفرع، أو تعطيله وتفعيله تاني (active) - نفس أسلوب updateCustomer/updateProduct
// (partial update بـ active جواه بدل دالة منفصلة لكل حاجة). قبل كده مكانش فيه أي طريقة تعدّل مكان
// اتضاف بالغلط أو تغيّر اسمه غير إنك تدخل على قاعدة البيانات يدوي.
export async function updateLocation(id: string, data: Partial<{ name: string; type: "SHOP" | "WAREHOUSE" | "OTHER"; active: boolean }>) {
  try {
    await requirePermission("settings.manage");
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) {
      if (!data.name.trim()) throw new Error("اسم المكان مطلوب");
      payload.name = data.name.trim();
    }
    if (data.type !== undefined) payload.type = data.type;
    if (data.active !== undefined) payload.active = data.active;
    if (Object.keys(payload).length === 0) return;
    await db.update(schema.locations).set(payload).where(eq(schema.locations.id, id));
    revalidatePath("/settings");
    revalidatePath("/products");
  } catch (e) {
    return toActionError(e, "تعذر تعديل المكان - يمكن الاسم ده مستخدم بالفعل لمكان تاني");
  }
}

// حذف حقيقي للمكان - بس لو مش مرتبط بأي عملية حقيقية (مخزون، فواتير بيع/شراء، تحويلات). لو مرتبط
// بأي حاجة من دول، بنرفض الحذف برسالة توضح السبب وننصح بزرار "تعطيل" بدل الحذف - عشان حذف مكان له
// تاريخ حركة كان هيسيب صفوف يتيمة أو يكسر أي شاشة/تقرير بيعتمد على locationId ده (الفواتير مثلًا
// عمودها location_id NOT NULL، فحذف حقيقي كان هيبوّظ أي فاتورة قديمة مرتبطة بيه).
export async function deleteLocation(id: string) {
  try {
    await requirePermission("settings.manage");
    const [stockRow] = await db
      .select({ id: schema.stocks.id })
      .from(schema.stocks)
      .where(and(eq(schema.stocks.locationId, id), sql`${schema.stocks.quantity} <> 0`))
      .limit(1);
    if (stockRow) throw new Error("متقدرش تمسح المكان ده - لسه فيه مخزون بضاعة مسجل عليه. انقل أو صفّر المخزون الأول، أو استخدم زرار التعطيل بدل الحذف.");
    const [invRow] = await db.select({ id: schema.salesInvoices.id }).from(schema.salesInvoices).where(eq(schema.salesInvoices.locationId, id)).limit(1);
    if (invRow) throw new Error("متقدرش تمسح المكان ده - مرتبط بفواتير بيع سابقة. استخدم زرار التعطيل بدل الحذف عشان تحافظ على سجل الفواتير القديمة.");
    const [purRow] = await db.select({ id: schema.purchases.id }).from(schema.purchases).where(eq(schema.purchases.locationId, id)).limit(1);
    if (purRow) throw new Error("متقدرش تمسح المكان ده - مرتبط بفواتير شراء سابقة. استخدم زرار التعطيل بدل الحذف.");
    const [trRow] = await db
      .select({ id: schema.stockTransfers.id })
      .from(schema.stockTransfers)
      .where(or(eq(schema.stockTransfers.fromLocationId, id), eq(schema.stockTransfers.toLocationId, id)))
      .limit(1);
    if (trRow) throw new Error("متقدرش تمسح المكان ده - مرتبط بتحويلات مخزون سابقة. استخدم زرار التعطيل بدل الحذف.");
    await db.delete(schema.locations).where(eq(schema.locations.id, id));
    revalidatePath("/settings");
    revalidatePath("/products");
  } catch (e) {
    return toActionError(e, "تعذر حذف المكان");
  }
}

// نفس مشكلة كود الفاتورة القديمة بالظبط: Math.random() ضيق كان بيزوّد احتمال تكرار الكود مع زيادة
// عدد المنتجات ويوقّع خطأ غامض بدل ما يتحفظ المنتج. استخدمنا crypto.randomBytes بدل كده زي الفاتورة.
function genSku() {
  return "P" + randomBytes(5).toString("hex").toUpperCase();
}
function genBarcode() {
  // كان بيولّد 12 رقم بس ("20" + 10 أرقام) من غير أي check digit - يعني مش باركود EAN-13 حقيقي
  // (اللي لازم يكون 13 رقم بالظبط، آخر رقم فيهم checksum محسوب من الـ12 اللي قبله). كان "شغال"
  // بالصدفة بس لأن ملصق الطباعة بيرندره بصيغة CODE128 اللي مالهاش شروط عدد أرقام أو checksum -
  // لكن لو حد استورد الباركود ده في أي نظام تاني بيتوقع EAN-13 حقيقي (زي سكانر خارجي أو منصة بيع)، هيترفض كباركود غير صحيح.
  let prefix = "20";
  const bytes = randomBytes(10);
  for (let i = 0; i < 10; i++) prefix += (bytes[i] % 10).toString();
  const checkDigit = ean13CheckDigit(prefix);
  return prefix + checkDigit;
}

// حساب checksum معيار EAN-13 القياسي: بداية من اليمين، الأرقام في المواضع الفردية تتضرب في 3
// والزوجية في 1 (أو العكس حسب الاتجاه)، والـ check digit هو الرقم اللي يخلي المجموع قابل للقسمة على 10
function ean13CheckDigit(twelveDigits: string): string {
  const digits = twelveDigits.split("").map(Number);
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  return String(check);
}

export async function createProduct(data: {
  name: string;
  categoryId?: string;
  requiresSerial: boolean;
  warrantyMonths?: number;
  unit?: string;
  wholesalePrice: number;
  retailPrice: number;
  minSellingPrice?: number;
  reorderPoint: number;
  barcode?: string;
  sku?: string;
  imageUrl?: string;
}) {
  try {
    return await createProductInner(data);
  } catch (e) {
    return toActionError(e, "تعذر إضافة المنتج - يمكن الباركود أو الكود مكرر لمنتج تاني");
  }
}

async function createProductInner(data: Parameters<typeof createProduct>[0]) {
  await requirePermission("products.manage");
  const [p] = await db
    .insert(schema.products)
    .values({
      name: data.name,
      categoryId: data.categoryId,
      requiresSerial: data.requiresSerial,
      warrantyMonths: data.warrantyMonths,
      unit: data.unit || "قطعة",
      wholesalePrice: data.wholesalePrice.toFixed(2),
      retailPrice: data.retailPrice.toFixed(2),
      minSellingPrice: data.minSellingPrice !== undefined && data.minSellingPrice !== null ? data.minSellingPrice.toFixed(2) : undefined,
      reorderPoint: data.reorderPoint,
      sku: data.sku || genSku(),
      barcode: data.barcode || genBarcode(),
      imageUrl: data.imageUrl,
    })
    .returning();
  await logAudit({ action: "CREATE", entityType: "Product", entityId: p.id, after: p });
  revalidatePath("/products");
  return p;
}

export async function updateProduct(id: string, data: Partial<{
  name: string; categoryId: string; requiresSerial: boolean; warrantyMonths: number;
  unit: string; wholesalePrice: number; retailPrice: number; minSellingPrice: number | null; reorderPoint: number; active: boolean; imageUrl: string;
}>) {
  try {
    return await updateProductInner(id, data);
  } catch (e) {
    return toActionError(e, "تعذر حفظ التعديل");
  }
}

async function updateProductInner(id: string, data: Parameters<typeof updateProduct>[1]) {
  await requirePermission("products.manage");
  const before = await db.select().from(schema.products).where(eq(schema.products.id, id)).then(r => r[0]);
  // بنبني الـ payload بأسماء الأعمدة المسموحة صراحةً واحد واحد - مش {...data} - عشان لو حد بعت طلب
  // مباشر لنقطة الـ Server Action دي (من برا الواجهة، متجاوز الـ TypeScript اللي بيتفحص وقت البرمجة
  // بس مش وقت التشغيل) وحط في الطلب عمود حساس زي avgCost (سعر التكلفة المتوسط - بيتحسب تلقائيًا من
  // عمليات الشراء والتحويل فقط ومينفعش يتغيّر يدوي أبدًا، وإلا كل تقييم المخزون والأرباح يبقى غلط)،
  // متتسجلش. كل عمود مسموح بيتاخد بالاسم صراحةً بس لو موجود في data.
  const payload: any = { updatedAt: new Date() };
  if (data.name !== undefined) payload.name = data.name;
  if (data.categoryId !== undefined) payload.categoryId = data.categoryId;
  if (data.requiresSerial !== undefined) payload.requiresSerial = data.requiresSerial;
  if (data.warrantyMonths !== undefined) payload.warrantyMonths = data.warrantyMonths;
  if (data.unit !== undefined) payload.unit = data.unit;
  if (data.reorderPoint !== undefined) payload.reorderPoint = data.reorderPoint;
  if (data.active !== undefined) payload.active = data.active;
  if (data.imageUrl !== undefined) payload.imageUrl = data.imageUrl;
  if (data.wholesalePrice !== undefined) payload.wholesalePrice = data.wholesalePrice.toFixed(2);
  if (data.retailPrice !== undefined) payload.retailPrice = data.retailPrice.toFixed(2);
  if (data.minSellingPrice !== undefined) payload.minSellingPrice = data.minSellingPrice === null ? null : data.minSellingPrice.toFixed(2);
  const [p] = await db.update(schema.products).set(payload).where(eq(schema.products.id, id)).returning();
  await logAudit({ action: "UPDATE", entityType: "Product", entityId: id, before, after: p });
  revalidatePath("/products");
  return p;
}

export async function listProductsWithStock(search?: string) {
  await requirePermission("products.view");
  const locs = await db.select().from(schema.locations);
  const prods = await db
    .select()
    .from(schema.products)
    .where(
      search
        ? or(ilike(schema.products.name, `%${search}%`), ilike(schema.products.barcode, `%${search}%`), ilike(schema.products.sku, `%${search}%`))
        : undefined
    )
    .orderBy(schema.products.name);
  const stocks = await db.select().from(schema.stocks);

  return prods.map((p) => {
    const byLoc: Record<string, number> = {};
    let total = 0;
    for (const l of locs) byLoc[l.id] = 0;
    for (const s of stocks.filter((s) => s.productId === p.id)) {
      byLoc[s.locationId] = s.quantity;
      total += s.quantity;
    }
    return { ...p, stockByLocation: byLoc, totalStock: total };
  });
}

export async function getInventoryByLocation(locationId: string) {
  await requirePermission("products.view");
  const stocks = await db
    .select({
      productId: schema.stocks.productId,
      quantity: schema.stocks.quantity,
      productName: schema.products.name,
      avgCost: schema.products.avgCost,
      barcode: schema.products.barcode,
    })
    .from(schema.stocks)
    .innerJoin(schema.products, eq(schema.stocks.productId, schema.products.id))
    .where(eq(schema.stocks.locationId, locationId));

  const rows = stocks
    .filter((s) => s.quantity > 0)
    .map((s) => ({ ...s, costValue: s.quantity * Number(s.avgCost) }))
    .sort((a, b) => a.productName.localeCompare(b.productName, "ar"));

  const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);
  const totalValue = rows.reduce((sum, r) => sum + r.costValue, 0);
  return { rows, totalQuantity, totalValue };
}

export async function getReorderAlerts() {
  await requirePermission("inventory.view");
  const prods = await listProductsWithStock();
  // تنبيه بسيط بناءً على الحد اليدوي
  const manual = prods.filter((p) => p.totalStock <= p.reorderPoint && p.active);

  // قائمة ذكية: معدل البيع الفعلي آخر 30 يوم مقابل الرصيد الحالي
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const soldRows = await db
    .select({
      productId: schema.salesInvoiceItems.productId,
      qty: sql<number>`sum(${schema.salesInvoiceItems.quantity})`.as("qty"),
    })
    .from(schema.salesInvoiceItems)
    .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
    .where(gte(schema.salesInvoices.createdAt, since))
    .groupBy(schema.salesInvoiceItems.productId);

  const soldMap = new Map(soldRows.map((r) => [r.productId, Number(r.qty)]));
  const smart = prods
    .map((p) => {
      const sold30 = soldMap.get(p.id) || 0;
      const dailyRate = sold30 / 30;
      const daysLeft = dailyRate > 0 ? p.totalStock / dailyRate : Infinity;
      return { ...p, sold30, dailyRate, daysLeft };
    })
    .filter((p) => p.active && p.dailyRate > 0 && p.daysLeft <= 14) // هينفد خلال أسبوعين
    .sort((a, b) => a.daysLeft - b.daysLeft);

  return { manual, smart };
}

export async function bestSellers(from: Date, to: Date) {
  await requirePermission("reports.view");
  const rows = await db
    .select({
      productId: schema.salesInvoiceItems.productId,
      name: schema.products.name,
      qty: sql<number>`sum(${schema.salesInvoiceItems.quantity})`.as("qty"),
      revenue: sql<number>`sum(${schema.salesInvoiceItems.quantity} * ${schema.salesInvoiceItems.unitPrice})`.as("revenue"),
    })
    .from(schema.salesInvoiceItems)
    .innerJoin(schema.salesInvoices, eq(schema.salesInvoiceItems.invoiceId, schema.salesInvoices.id))
    .innerJoin(schema.products, eq(schema.salesInvoiceItems.productId, schema.products.id))
    .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
    .groupBy(schema.salesInvoiceItems.productId, schema.products.name)
    .orderBy(sql`sum(${schema.salesInvoiceItems.quantity}) desc`)
    .limit(50);
  return rows;
}

export async function findBySerial(serialNumber: string) {
  await requirePermission("products.view");
  const [row] = await db
    .select()
    .from(schema.productSerials)
    .where(eq(schema.productSerials.serialNumber, serialNumber));
  if (!row) return null;
  const [product] = await db.select().from(schema.products).where(eq(schema.products.id, row.productId));
  let inWarranty = false;
  if (row.warrantyStart && row.warrantyMonths) {
    const expiry = new Date(row.warrantyStart);
    expiry.setMonth(expiry.getMonth() + row.warrantyMonths);
    inWarranty = new Date() < expiry;
  }
  return { ...row, product, inWarranty };
}

export async function getAvailableSerials(productId: string, locationId?: string) {
  // كانت من غير أي تحقق تسجيل دخول - أي حد يقدر يشوف كل أرقام السيريال المتاحة من غير ما يكون مسجل دخول
  await requirePermission("products.view");
  const rows = await db
    .select()
    .from(schema.productSerials)
    .where(
      and(
        eq(schema.productSerials.productId, productId),
        eq(schema.productSerials.status, "IN_STOCK"),
        locationId ? eq(schema.productSerials.locationId, locationId) : undefined
      )
    );
  return rows;
}

export async function supplierPriceHistory(productId: string) {
  await requirePermission("products.view");
  const rows = await db
    .select({
      id: schema.supplierProductPrices.id,
      price: schema.supplierProductPrices.price,
      createdAt: schema.supplierProductPrices.createdAt,
      supplierName: schema.suppliers.name,
      supplierId: schema.suppliers.id,
    })
    .from(schema.supplierProductPrices)
    .innerJoin(schema.suppliers, eq(schema.supplierProductPrices.supplierId, schema.suppliers.id))
    .where(eq(schema.supplierProductPrices.productId, productId))
    .orderBy(sql`${schema.supplierProductPrices.createdAt} desc`);
  // آخر سعر لكل مورد
  const latestPerSupplier = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!latestPerSupplier.has(r.supplierId)) latestPerSupplier.set(r.supplierId, r);
  return { all: rows, latestPerSupplier: [...latestPerSupplier.values()] };
}
