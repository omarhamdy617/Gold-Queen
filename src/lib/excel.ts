import "server-only";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { cairoDayRange, cairoYmd } from "@/lib/time";

// أدوات مشتركة لكل تقارير Excel - عشان كل ملف يطلع بنفس الشكل: الشيت من اليمين للشمال، عناوين
// الأعمدة بخط عريض ومثبّتة فوق، والأرقام أرقام حقيقية (مش نص) عشان تقدر تجمعها في Excel على طول.

export type Col = { header: string; key: string; width?: number; money?: boolean };

export function addSheet(wb: ExcelJS.Workbook, name: string, cols: Col[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3EBD6" } };
  for (const r of rows) ws.addRow(r);
  for (const c of cols) {
    if (c.money) ws.getColumn(c.key).numFmt = "#,##0.00";
  }
  return ws;
}

// صف إجمالي بخط عريض في آخر الشيت - للأعمدة اللي فيها فلوس بس
export function addTotalRow(ws: ExcelJS.Worksheet, cols: Col[], rows: Record<string, unknown>[], labelKey: string) {
  const total: Record<string, unknown> = { [labelKey]: "الإجمالي" };
  for (const c of cols) {
    if (c.money) total[c.key] = rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
  }
  const row = ws.addRow(total);
  row.font = { bold: true };
}

export async function xlsxResponse(wb: ExcelJS.Workbook, baseName: string) {
  const buf = await wb.xlsx.writeBuffer();
  const ascii = baseName.replace(/[^\w.-]+/g, "-");
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${ascii}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

// تاريخ ووقت بتوقيت القاهرة كنص ثابت الشكل (2026-10-11 14:05) - Excel بيعرضه زي ما هو من غير ما
// يقلبه لتوقيت الجهاز
export function cairoDateTime(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return `${m.year}-${m.month}-${m.day} ${m.hour === "24" ? "00" : m.hour}:${m.minute}`;
}

export { cairoYmd };

// فترة التقرير من بارامترات الرابط (from/to بصيغة YYYY-MM-DD) - نفس تفسير الشاشات بالظبط (cairoDayRange)
export function rangeFromParams(params: URLSearchParams) {
  const { from, to } = cairoDayRange(params.get("from"), params.get("to"));
  return { from, to, label: `${cairoYmd(from)}_${cairoYmd(to)}` };
}

// أي خطأ بيرجع رسالة عربية واضحة بدل صفحة خطأ عامة، ومن غير تفاصيل تقنية (زي نص استعلام SQL)
export function exportError(e: unknown) {
  const raw = e instanceof Error ? e.message : "";
  if (raw === "UNAUTHORIZED") return NextResponse.json({ error: "سجّل دخول الأول" }, { status: 401 });
  if (raw.startsWith("FORBIDDEN")) return NextResponse.json({ error: "مش مصرّح لك بتصدير التقرير ده - الصلاحية مش متاحة لدورك" }, { status: 403 });
  return NextResponse.json({ error: "تعذر تجهيز ملف Excel - جرب تاني" }, { status: 500 });
}
