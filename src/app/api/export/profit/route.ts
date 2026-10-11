import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getProfitSummary, getProfitBreakdownByProduct, getMonthlyPerformance } from "@/actions/reports";
import { addSheet, addTotalRow, xlsxResponse, rangeFromParams, exportError, cairoYmd, type Col } from "@/lib/excel";

// تقرير "الأرباح والأداء" كملف Excel - نفس أرقام الشاشة بالظبط (نفس الدوال). الصلاحية (reports.view)
// بتتفحص جوه الدوال نفسها، فأي حد مالوش الصلاحية بياخد رفض حتى لو فتح الرابط مباشرة.
export async function GET(req: NextRequest) {
  try {
    const { from, to, label } = rangeFromParams(new URL(req.url).searchParams);
    // واحد ورا التاني مش Promise.all (درس الدفعات 19-20)
    const summary = await getProfitSummary(from, to);
    const monthly = await getMonthlyPerformance(12);
    const byProduct = await getProfitBreakdownByProduct(from, to);

    const wb = new ExcelJS.Workbook();

    const sumCols: Col[] = [
      { header: "البند", key: "item", width: 34 },
      { header: "القيمة", key: "value", width: 18, money: true },
    ];
    const ws = addSheet(wb, "ملخص الفترة", sumCols, [
      { item: `الفترة: من ${cairoYmd(from)} إلى ${cairoYmd(to)}`, value: null },
      { item: "إجمالي المبيعات", value: summary.salesTotal },
      { item: "إجمالي الربح (هامش البيع بعد المرتجعات)", value: summary.grossProfit },
      { item: "المصروفات", value: summary.expensesTotal },
      { item: "إيرادات أخرى", value: summary.otherIncomeTotal },
      { item: "صافي الربح", value: summary.netProfit },
    ]);
    ws.getRow(7).font = { bold: true };
    ws.addRow({});
    ws.addRow({ item: "صافي الربح = إجمالي الربح − المصروفات + الإيرادات الأخرى" });

    const mCols: Col[] = [
      { header: "الشهر", key: "label", width: 18 },
      { header: "المبيعات", key: "salesTotal", money: true },
      { header: "إجمالي الربح", key: "grossProfit", money: true },
      { header: "المصروفات", key: "expensesTotal", money: true },
      { header: "إيرادات أخرى", key: "otherIncomeTotal", money: true },
      { header: "صافي الربح", key: "netProfit", money: true },
    ];
    const mRows = monthly.map((m) => ({ ...m }));
    const mws = addSheet(wb, "آخر 12 شهر", mCols, mRows);
    addTotalRow(mws, mCols, mRows, "label");

    const pCols: Col[] = [
      { header: "المنتج", key: "name", width: 34 },
      { header: "الكمية المباعة", key: "qty", width: 14 },
      { header: "الإيراد", key: "revenue", money: true },
      { header: "الربح", key: "profit", money: true },
      { header: "هامش الربح %", key: "margin", width: 14 },
    ];
    const pRows = byProduct.map((p) => ({ ...p, margin: p.revenue > 0 ? Number(((p.profit / p.revenue) * 100).toFixed(1)) : 0 }));
    const pws = addSheet(wb, "الربح حسب المنتج", pCols, pRows);
    addTotalRow(pws, pCols, pRows, "name");

    return await xlsxResponse(wb, `profit_${label}`);
  } catch (e) {
    return exportError(e);
  }
}
