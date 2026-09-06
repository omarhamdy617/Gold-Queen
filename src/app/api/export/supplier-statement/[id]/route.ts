import { NextRequest, NextResponse } from "next/server";
import { getSupplier, getSupplierLedger } from "@/actions/purchases";
import { buildSupplierTimeline } from "@/lib/statement";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "excel";

  const supplier = await getSupplier(id);
  if (!supplier) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  const { purchases, payments } = await getSupplierLedger(id);

  // كان بيتبني هنا يدويًا من غير عمود "الرصيد" خالص - على عكس كشف حساب العميل. استخدمنا نفس دالة
  // buildSupplierTimeline الموجودة أصلًا في lib/statement.ts (كانت متعرّفة بس مش مستخدمة هنا).
  const { rows: timeline, opening } = buildSupplierTimeline(
    Number(supplier.balance),
    purchases.map((p) => ({ ...p, total: p.totalAmount })),
    payments
  );

  if (format === "pdf") {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    doc.fontSize(18).text("Gold Queen - Supplier Statement / كشف حساب مورد", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Supplier: ${supplier.name}  |  Balance: ${supplier.balance}`);
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`Opening balance: ${opening.toFixed(2)}`);
    for (const t of timeline) {
      doc.text(`${new Date(t.date).toLocaleDateString()}  ${t.type}  ${t.ref}  Debit:${t.debit || 0}  Credit:${t.credit || 0}  Balance:${t.balance!.toFixed(2)}`);
    }
    doc.end();
    const buffer = await done;
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="supplier-statement-${id}.pdf"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("كشف حساب مورد");
  sheet.views = [{ rightToLeft: true }];
  sheet.columns = [
    { header: "التاريخ", key: "date", width: 20 },
    { header: "البيان", key: "type", width: 15 },
    { header: "مرجع", key: "ref", width: 15 },
    { header: "مدين", key: "debit", width: 15 },
    { header: "دائن", key: "credit", width: 15 },
    { header: "الرصيد", key: "balance", width: 15 },
  ];
  sheet.addRow({ date: "", type: "رصيد افتتاحي", ref: "", debit: "", credit: "", balance: opening.toFixed(2) });
  for (const t of timeline) {
    sheet.addRow({ date: new Date(t.date).toLocaleString("en-GB"), type: t.type, ref: t.ref, debit: t.debit || "", credit: t.credit || "", balance: t.balance!.toFixed(2) });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="supplier-statement-${id}.xlsx"`,
    },
  });
}
