import ExcelJS from "exceljs";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { can } from "@/lib/auth";
import { db, schema } from "@/db";
import { addSheet, addTotalRow, xlsxResponse, exportError, cairoYmd, type Col } from "@/lib/excel";

// المنتجات بكمياتها في كل فرع. التكلفة وقيمة المخزون بيظهروا بس لو المستخدم عنده صلاحية "معرفة تكلفة
// المنتجات وإجمالي قيمة المخزون" (inventory.cost.view) - نفس قاعدة شاشة المنتجات بالظبط.
export async function GET() {
  try {
    const products = await listProductsWithStock(); // بتتحقق من products.view جواها
    const locations = await listLocations();
    const showCost = await can("inventory.cost.view");
    const categories = await db.select().from(schema.categories);
    const catName = new Map(categories.map((c) => [c.id, c.name]));

    const cols: Col[] = [
      { header: "المنتج", key: "name", width: 34 },
      { header: "SKU", key: "sku", width: 14 },
      { header: "الباركود", key: "barcode", width: 16 },
      { header: "التصنيف", key: "category", width: 16 },
      ...locations.map((l) => ({ header: `كمية: ${l.name}`, key: `loc_${l.id}`, width: 14 })),
      { header: "إجمالي الكمية", key: "totalStock", width: 14 },
      { header: "حد إعادة الطلب", key: "reorderPoint", width: 14 },
      { header: "سعر القطاعي", key: "retailPrice", money: true },
      { header: "سعر الجملة", key: "wholesalePrice", money: true },
      ...(showCost
        ? ([
            { header: "متوسط التكلفة", key: "avgCost", money: true },
            { header: "قيمة المخزون بالتكلفة", key: "stockValue", width: 20, money: true },
          ] as Col[])
        : []),
      { header: "الحالة", key: "status", width: 10 },
    ];

    const rows = products.map((p) => {
      const row: Record<string, unknown> = {
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: (p.categoryId && catName.get(p.categoryId)) || "",
        totalStock: p.totalStock,
        reorderPoint: p.reorderPoint,
        retailPrice: Number(p.retailPrice),
        wholesalePrice: Number(p.wholesalePrice),
        status: p.active ? "نشط" : "موقوف",
      };
      for (const l of locations) row[`loc_${l.id}`] = p.stockByLocation[l.id] || 0;
      if (showCost) {
        row.avgCost = Number(p.avgCost);
        row.stockValue = p.totalStock * Number(p.avgCost);
      }
      return row;
    });

    const wb = new ExcelJS.Workbook();
    const ws = addSheet(wb, "المخزون", cols, rows);
    // الإجمالي هنا لقيمة المخزون بس - جمع أسعار البيع مالوش معنى
    if (showCost) addTotalRow(ws, cols.filter((c) => c.key === "stockValue"), rows, "name");

    return await xlsxResponse(wb, `inventory_${cairoYmd(new Date())}`);
  } catch (e) {
    return exportError(e);
  }
}
