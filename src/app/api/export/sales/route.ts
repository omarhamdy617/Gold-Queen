import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requirePermission, can } from "@/lib/auth";
import { addSheet, addTotalRow, xlsxResponse, rangeFromParams, exportError, cairoDateTime, type Col } from "@/lib/excel";

const STATUS: Record<string, string> = { PAID: "مدفوعة", UNPAID: "آجل", PARTIAL: "جزئي" };

// كل فواتير البيع في فترة + شيت تاني بتفاصيل الأصناف. أعمدة التكلفة والربح بتظهر بس لو المستخدم
// عنده صلاحية "معرفة تكلفة المنتجات" (inventory.cost.view) - نفس قاعدة الشاشات بالظبط.
export async function GET(req: NextRequest) {
  try {
    await requirePermission("sales.view");
    const showCost = await can("inventory.cost.view");
    const { from, to, label } = rangeFromParams(new URL(req.url).searchParams);
    const seller = alias(schema.users, "seller");

    const invoices = await db
      .select({
        id: schema.salesInvoices.id,
        code: schema.salesInvoices.code,
        createdAt: schema.salesInvoices.createdAt,
        customerName: schema.customers.name,
        locationName: schema.locations.name,
        sourceName: schema.orderSources.name,
        subtotal: schema.salesInvoices.subtotal,
        discount: schema.salesInvoices.discount,
        vatEnabled: schema.salesInvoices.vatEnabled,
        vatRate: schema.salesInvoices.vatRate,
        total: schema.salesInvoices.total,
        paidAmount: schema.salesInvoices.paidAmount,
        paymentStatus: schema.salesInvoices.paymentStatus,
        paymentMethodName: schema.paymentMethods.name,
        sellerName: seller.fullName,
        notes: schema.salesInvoices.notes,
      })
      .from(schema.salesInvoices)
      .leftJoin(schema.customers, eq(schema.salesInvoices.customerId, schema.customers.id))
      .leftJoin(schema.locations, eq(schema.salesInvoices.locationId, schema.locations.id))
      .leftJoin(schema.orderSources, eq(schema.salesInvoices.source, schema.orderSources.id))
      .leftJoin(schema.paymentMethods, eq(schema.salesInvoices.paymentMethodId, schema.paymentMethods.id))
      .leftJoin(seller, eq(schema.salesInvoices.soldById, seller.id))
      .where(and(gte(schema.salesInvoices.createdAt, from), lte(schema.salesInvoices.createdAt, to)))
      .orderBy(asc(schema.salesInvoices.createdAt));

    const invCols: Col[] = [
      { header: "الكود", key: "code", width: 20 },
      { header: "التاريخ", key: "date", width: 18 },
      { header: "العميل", key: "customer", width: 22 },
      { header: "الفرع", key: "location", width: 14 },
      { header: "المصدر", key: "source", width: 14 },
      { header: "قبل الخصم", key: "subtotal", money: true },
      { header: "الخصم", key: "discount", money: true },
      { header: "الضريبة %", key: "vat", width: 10 },
      { header: "الإجمالي", key: "total", money: true },
      { header: "المدفوع", key: "paid", money: true },
      { header: "المتبقي", key: "remaining", money: true },
      { header: "الحالة", key: "status", width: 10 },
      { header: "طريقة الدفع", key: "paymentMethod", width: 16 },
      { header: "البايع", key: "seller", width: 18 },
      { header: "ملاحظات", key: "notes", width: 28 },
    ];
    const invRows = invoices.map((i) => ({
      code: i.code,
      date: cairoDateTime(i.createdAt),
      customer: i.customerName || "عميل نقدي",
      location: i.locationName || "",
      source: i.sourceName || "",
      subtotal: Number(i.subtotal),
      discount: Number(i.discount),
      vat: i.vatEnabled ? Number(i.vatRate || 0) : "",
      total: Number(i.total),
      paid: Number(i.paidAmount),
      remaining: Number(i.total) - Number(i.paidAmount),
      status: STATUS[i.paymentStatus] || i.paymentStatus,
      paymentMethod: i.paymentMethodName || "",
      seller: i.sellerName || "",
      notes: i.notes || "",
    }));
    const wb = new ExcelJS.Workbook();
    const invWs = addSheet(wb, "الفواتير", invCols, invRows);
    addTotalRow(invWs, invCols, invRows, "code");

    const codeById = new Map(invoices.map((i) => [i.id, i.code]));
    const ids = invoices.map((i) => i.id);
    const items = ids.length
      ? await db
          .select({
            invoiceId: schema.salesInvoiceItems.invoiceId,
            productName: schema.products.name,
            sku: schema.products.sku,
            quantity: schema.salesInvoiceItems.quantity,
            unitPrice: schema.salesInvoiceItems.unitPrice,
            unitCost: schema.salesInvoiceItems.unitCost,
          })
          .from(schema.salesInvoiceItems)
          .innerJoin(schema.products, eq(schema.salesInvoiceItems.productId, schema.products.id))
          .where(inArray(schema.salesInvoiceItems.invoiceId, ids))
      : [];

    const itemCols: Col[] = [
      { header: "كود الفاتورة", key: "code", width: 20 },
      { header: "المنتج", key: "product", width: 32 },
      { header: "SKU", key: "sku", width: 14 },
      { header: "الكمية", key: "qty", width: 10 },
      { header: "سعر الوحدة", key: "unitPrice", money: true },
      { header: "إجمالي السطر", key: "lineTotal", money: true },
      ...(showCost
        ? ([
            { header: "تكلفة الوحدة", key: "unitCost", money: true },
            { header: "ربح السطر", key: "lineProfit", money: true },
          ] as Col[])
        : []),
    ];
    const itemRows = items.map((it) => {
      const row: Record<string, unknown> = {
        code: codeById.get(it.invoiceId) || "",
        product: it.productName,
        sku: it.sku,
        qty: it.quantity,
        unitPrice: Number(it.unitPrice),
        lineTotal: Number(it.unitPrice) * it.quantity,
      };
      if (showCost) {
        row.unitCost = Number(it.unitCost);
        row.lineProfit = (Number(it.unitPrice) - Number(it.unitCost)) * it.quantity;
      }
      return row;
    });
    const itemWs = addSheet(wb, "تفاصيل الأصناف", itemCols, itemRows);
    addTotalRow(itemWs, itemCols, itemRows, "code");

    return await xlsxResponse(wb, `sales_${label}`);
  } catch (e) {
    return exportError(e);
  }
}
