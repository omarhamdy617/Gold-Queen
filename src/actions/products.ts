"use server";
import { db, schema } from "@/db";
import { eq, and, sql, ilike, or, gte, lte } from "drizzle-orm";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function listCategories() {
  return db.select().from(schema.categories);
}

export async function createCategory(data: { name: string; requiresSerial: boolean; defaultWarrantyMonths?: number }) {
  await requirePermission("products.manage");
  const [cat] = await db.insert(schema.categories).values(data).returning();
  revalidatePath("/products");
  return cat;
}

export async function listLocations() {
  return db.select().from(schema.locations);
}

export async function createLocation(name: string, type: "SHOP" | "WAREHOUSE" | "OTHER") {
  await requirePermission("settings.manage");
  const [loc] = await db.insert(schema.locations).values({ name, type }).returning();
  revalidatePath("/products");
  return loc;
}

function genSku() {
  return "P" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
function genBarcode() {
  // EAN-13-like random numeric barcode
  let code = "20";
  for (let i = 0; i < 10; i++) code += Math.floor(Math.random() * 10);
  return code;
}

export async function createProduct(data: {
  name: string;
  categoryId?: string;
  requiresSerial: boolean;
  warrantyMonths?: number;
  unit?: string;
  wholesalePrice: number;
  retailPrice: number;
  reorderPoint: number;
  barcode?: string;
  sku?: string;
}) {
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
      reorderPoint: data.reorderPoint,
      sku: data.sku || genSku(),
      barcode: data.barcode || genBarcode(),
    })
    .returning();
  await logAudit({ action: "CREATE", entityType: "Product", entityId: p.id, after: p });
  revalidatePath("/products");
  return p;
}

export async function updateProduct(id: string, data: Partial<{
  name: string; categoryId: string; requiresSerial: boolean; warrantyMonths: number;
  unit: string; wholesalePrice: number; retailPrice: number; reorderPoint: number; active: boolean;
}>) {
  await requirePermission("products.manage");
  const before = await db.select().from(schema.products).where(eq(schema.products.id, id)).then(r => r[0]);
  const payload: any = { ...data, updatedAt: new Date() };
  if (data.wholesalePrice !== undefined) payload.wholesalePrice = data.wholesalePrice.toFixed(2);
  if (data.retailPrice !== undefined) payload.retailPrice = data.retailPrice.toFixed(2);
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
