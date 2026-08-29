import { listInvoices } from "@/actions/sales";
import { money, dateAr } from "@/lib/format";
import Link from "next/link";

export default async function SalesPage() {
  const invoices = await listInvoices();
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">الفواتير</h1>
        <Link href="/sales/new" className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ فاتورة جديدة</Link>
      </div>
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
                <td className="p-3"><Link href={`/sales/${inv.id}`} className="text-gold font-mono text-xs">{inv.code}</Link></td>
                <td>{inv.customerName || "عميل نقدي"}</td>
                <td>{money(inv.total)}</td>
                <td>{money(inv.paidAmount)}</td>
                <td>{statusLabel(inv.paymentStatus)}</td>
                <td>{sourceLabel(inv.source)}</td>
                <td>{dateAr(inv.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function statusLabel(s: string) { return { PAID: "مدفوعة", UNPAID: "آجل", PARTIAL: "جزئي" }[s] || s; }
function sourceLabel(s: string) { return { WEBSITE: "الموقع", PHONE: "تليفون", WHATSAPP: "واتساب", FACEBOOK: "فيسبوك", OTHER: "المحل" }[s] || s; }
