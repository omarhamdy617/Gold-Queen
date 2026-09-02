import { NextRequest, NextResponse } from "next/server";
import { getCustomer, customerStatement } from "@/actions/customers";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : new Date(0);
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();
  const format = url.searchParams.get("format") || "excel";

  const customer = await getCustomer(id);
  if (!customer) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  const { invoices, payments } = await customerStatement(id, from, to);

  const timeline = [
    ...invoices.map((i) => ({ date: i.createdAt, type: "فاتورة بيع", ref: i.code, debit: Number(i.total), credit: 0 })),
    ...payments.map((p) => ({ date: p.createdAt, type: "تحصيل", ref: "-", debit: 0, credit: Number(p.amount) })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (format === "pdf") {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    doc.fontSize(18).text("Gold Queen - Statement / كشف حساب", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(`Customer: ${customer.name}  |  Balance: ${customer.balance}`);
    doc.moveDown();
    doc.fontSize(10);
    for (const t of timeline) {
      doc.text(`${new Date(t.date).toLocaleDateString()}  ${t.type}  ${t.ref}  Debit:${t.debit || 0}  Credit:${t.credit || 0}`);
    }
    doc.end();
    const buffer = await done;
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="statement-${id}.pdf"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("كشف حساب");
  sheet.views = [{ rightToLeft: true }];
  sheet.columns = [
    { header: "التاريخ", key: "date", width: 20 },
    { header: "البيان", key: "type", width: 15 },
    { header: "مرجع", key: "ref", width: 15 },
    { header: "مدين", key: "debit", width: 15 },
    { header: "دائن", key: "credit", width: 15 },
  ];
  for (const t of timeline) {
    sheet.addRow({ date: new Date(t.date).toLocaleString("en-GB"), type: t.type, ref: t.ref, debit: t.debit || "", credit: t.credit || "" });
  }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="statement-${id}.xlsx"`,
    },
  });
}
