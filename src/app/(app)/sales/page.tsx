import { listInvoices } from "@/actions/sales";
import { listAllOrderSources } from "@/actions/orderSources";
import { money, dateAr } from "@/lib/format";
import Link from "next/link";
import InvoiceSearchBox from "./InvoiceSearchBox";

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [invoices, orderSources] = await Promise.all([listInvoices(q), listAllOrderSources()]);
  // مصادر الأوردر بقت جدول حقيقي قابل للتعديل من الإعدادات (بدل enum ثابت) - بنجيب كل المصادر
  // (حتى المعطّلة) مرة واحدة بس هنا وبنبني منها خريطة id->اسم، عشان فاتورة قديمة مرتبطة بمصدر
  // اتعطّل بعد كده تفضل عارضة اسمه صح بدل ما تعرض الـ id الخام
  const sourceMap: Record<string, string> = Object.fromEntries(orderSources.map((s: any) => [s.id, s.name]));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">الفواتير</h1>
        <Link href="/sales/new" className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ فاتورة جديدة</Link>
      </div>
      <InvoiceSearchBox initialQuery={q || ""} />
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="p-3">الكود</th>
              <th>العميل</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>الحالة</th>
              <th>المصدر</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b last:border-0 hover:bg-neutral-50">
                <td className="p-3"><Link href={`/sales/${inv.id}`} prefetch={false} className="text-gold font-mono text-xs">{inv.code}</Link></td>
                <td>{inv.customerName || "عميل نقدي"}</td>
                <td>{money(inv.total)}</td>
                <td>{money(inv.paidAmount)}</td>
                <td>{statusLabel(inv.paymentStatus)}</td>
                <td>{sourceMap[inv.source] || inv.source}</td>
                <td>{dateAr(inv.createdAt)}</td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-center text-muted">لا توجد فواتير مطابقة</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function statusLabel(s: string) { return { PAID: "مدفوعة", UNPAID: "آجل", PARTIAL: "جزئي" }[s] || s; }
