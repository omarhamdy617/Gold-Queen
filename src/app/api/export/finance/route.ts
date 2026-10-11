import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSession, can } from "@/lib/auth";
import { cashTxLabel } from "@/lib/cashTypes";
import { addSheet, addTotalRow, xlsxResponse, rangeFromParams, exportError, cairoDateTime, type Col } from "@/lib/excel";

const IN_TYPES = new Set(["SALE_IN", "COLLECTION_IN", "RETURN_IN", "TRANSFER_IN", "LOAN_IN", "ORDER_DEPOSIT_IN", "OTHER_INCOME_IN", "CAPITAL_IN"]);
const OUT_TYPES = new Set(["PURCHASE_OUT", "EXPENSE_OUT", "PAYMENT_OUT", "RETURN_OUT", "TRANSFER_OUT", "LOAN_OUT", "OWNER_DRAW_OUT"]);

// المصروفات + الإيرادات الأخرى + حركات الخزائن + رأس المال والمسحوبات في ملف واحد. كل شيت بيظهر
// بس لو المستخدم عنده صلاحيته (زي الشاشات بالظبط) - ولو مالوش ولا واحدة، الطلب بيترفض.
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const canExpenses = await can("expenses.manage");
    const canIncome = await can("income.manage");
    const canCash = await can("cash.view");
    const canCapital = await can("capital.manage");
    if (!canExpenses && !canIncome && !canCash && !canCapital) throw new Error("FORBIDDEN: finance export");

    const { from, to, label } = rangeFromParams(new URL(req.url).searchParams);
    const wb = new ExcelJS.Workbook();

    if (canExpenses) {
      const rows = await db
        .select({
          createdAt: schema.expenses.createdAt,
          category: schema.expenseCategories.name,
          amount: schema.expenses.amount,
          method: schema.paymentMethods.name,
          adSource: schema.orderSources.name,
          note: schema.expenses.note,
          by: schema.users.fullName,
        })
        .from(schema.expenses)
        .innerJoin(schema.expenseCategories, eq(schema.expenses.categoryId, schema.expenseCategories.id))
        .innerJoin(schema.paymentMethods, eq(schema.expenses.paymentMethodId, schema.paymentMethods.id))
        .leftJoin(schema.orderSources, eq(schema.expenses.adSourceId, schema.orderSources.id))
        .leftJoin(schema.users, eq(schema.expenses.createdById, schema.users.id))
        .where(and(gte(schema.expenses.createdAt, from), lte(schema.expenses.createdAt, to)))
        .orderBy(asc(schema.expenses.createdAt));
      const cols: Col[] = [
        { header: "التاريخ", key: "date", width: 18 },
        { header: "التصنيف", key: "category", width: 20 },
        { header: "المبلغ", key: "amount", money: true },
        { header: "الخزينة", key: "method", width: 16 },
        { header: "قناة الإعلان", key: "adSource", width: 14 },
        { header: "البيان", key: "note", width: 30 },
        { header: "اللي سجّله", key: "by", width: 18 },
      ];
      const data = rows.map((r) => ({ ...r, date: cairoDateTime(r.createdAt), amount: Number(r.amount), adSource: r.adSource || "", note: r.note || "", by: r.by || "" }));
      addTotalRow(addSheet(wb, "المصروفات", cols, data), cols, data, "date");
    }

    if (canIncome) {
      const rows = await db
        .select({
          createdAt: schema.income.createdAt,
          category: schema.incomeCategories.name,
          amount: schema.income.amount,
          method: schema.paymentMethods.name,
          note: schema.income.note,
          by: schema.users.fullName,
        })
        .from(schema.income)
        .innerJoin(schema.incomeCategories, eq(schema.income.categoryId, schema.incomeCategories.id))
        .innerJoin(schema.paymentMethods, eq(schema.income.paymentMethodId, schema.paymentMethods.id))
        .leftJoin(schema.users, eq(schema.income.createdById, schema.users.id))
        .where(and(gte(schema.income.createdAt, from), lte(schema.income.createdAt, to)))
        .orderBy(asc(schema.income.createdAt));
      const cols: Col[] = [
        { header: "التاريخ", key: "date", width: 18 },
        { header: "التصنيف", key: "category", width: 20 },
        { header: "المبلغ", key: "amount", money: true },
        { header: "الخزينة", key: "method", width: 16 },
        { header: "البيان", key: "note", width: 30 },
        { header: "اللي سجّله", key: "by", width: 18 },
      ];
      const data = rows.map((r) => ({ ...r, date: cairoDateTime(r.createdAt), amount: Number(r.amount), note: r.note || "", by: r.by || "" }));
      addTotalRow(addSheet(wb, "الإيرادات الأخرى", cols, data), cols, data, "date");
    }

    if (canCapital) {
      const rows = await db
        .select({
          createdAt: schema.capitalMovements.createdAt,
          kind: schema.capitalMovements.kind,
          amount: schema.capitalMovements.amount,
          method: schema.paymentMethods.name,
          note: schema.capitalMovements.note,
          by: schema.users.fullName,
        })
        .from(schema.capitalMovements)
        .innerJoin(schema.paymentMethods, eq(schema.capitalMovements.paymentMethodId, schema.paymentMethods.id))
        .leftJoin(schema.users, eq(schema.capitalMovements.createdById, schema.users.id))
        .where(and(gte(schema.capitalMovements.createdAt, from), lte(schema.capitalMovements.createdAt, to)))
        .orderBy(asc(schema.capitalMovements.createdAt));
      const cols: Col[] = [
        { header: "التاريخ", key: "date", width: 18 },
        { header: "النوع", key: "kind", width: 16 },
        { header: "رأس مال داخل", key: "capitalIn", money: true },
        { header: "مسحوبات", key: "draw", money: true },
        { header: "الخزينة", key: "method", width: 16 },
        { header: "ملاحظة", key: "note", width: 30 },
        { header: "اللي سجّلها", key: "by", width: 18 },
      ];
      const data = rows.map((r) => ({
        date: cairoDateTime(r.createdAt),
        kind: r.kind === "CAPITAL_IN" ? "إيداع رأس مال" : "مسحوبات شخصية",
        capitalIn: r.kind === "CAPITAL_IN" ? Number(r.amount) : null,
        draw: r.kind === "OWNER_DRAW" ? Number(r.amount) : null,
        method: r.method,
        note: r.note || "",
        by: r.by || "",
      }));
      addTotalRow(addSheet(wb, "رأس المال والمسحوبات", cols, data), cols, data, "date");
    }

    if (canCash) {
      const rows = await db
        .select({
          createdAt: schema.cashTransactions.createdAt,
          drawer: schema.cashDrawers.name,
          type: schema.cashTransactions.type,
          amount: schema.cashTransactions.amount,
          balanceAfter: schema.cashTransactions.balanceAfter,
          note: schema.cashTransactions.note,
          by: schema.users.fullName,
        })
        .from(schema.cashTransactions)
        .innerJoin(schema.cashDrawers, eq(schema.cashTransactions.drawerId, schema.cashDrawers.id))
        .leftJoin(schema.users, eq(schema.cashTransactions.createdById, schema.users.id))
        .where(and(gte(schema.cashTransactions.createdAt, from), lte(schema.cashTransactions.createdAt, to)))
        .orderBy(asc(schema.cashTransactions.createdAt));
      const cols: Col[] = [
        { header: "التاريخ", key: "date", width: 18 },
        { header: "الخزينة", key: "drawer", width: 20 },
        { header: "النوع", key: "type", width: 20 },
        { header: "داخل", key: "in", money: true },
        { header: "خارج", key: "out", money: true },
        { header: "تسوية", key: "adjust", money: true },
        { header: "الرصيد بعدها", key: "balanceAfter", width: 16 },
        { header: "ملاحظة", key: "note", width: 34 },
        { header: "اللي عملها", key: "by", width: 18 },
      ];
      const data = rows.map((r) => {
        const v = Number(r.amount);
        return {
          date: cairoDateTime(r.createdAt),
          drawer: r.drawer,
          type: cashTxLabel(r.type),
          in: IN_TYPES.has(r.type) ? v : null,
          out: OUT_TYPES.has(r.type) ? v : null,
          // التسويات مبلغها متخزن من غير إشارة - الاتجاه مكتوب في الملاحظة ("تسوية إضافة" / "تسوية خصم")
          adjust: r.type === "ADJUSTMENT" ? v : null,
          balanceAfter: Number(r.balanceAfter),
          note: r.note || "",
          by: r.by || "",
        };
      });
      const ws = addSheet(wb, "حركات الخزائن", cols, data);
      ws.getColumn("balanceAfter").numFmt = "#,##0.00";
    }

    return await xlsxResponse(wb, `finance_${label}`);
  } catch (e) {
    return exportError(e);
  }
}
