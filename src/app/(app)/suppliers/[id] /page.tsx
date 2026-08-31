import { getSupplier, getSupplierLedger } from "@/actions/purchases";
import { listPaymentMethods } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import PaySupplierForm from "./PaySupplierForm";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [supplier, ledger, paymentMethods] = await Promise.all([getSupplier(id), getSupplierLedger(id), listPaymentMethods()]);
  if (!supplier) return notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/suppliers" className="text-xs text-primary underline">← كل الموردين</Link>
        <h1 className="text-xl font-bold mt-1">{supplier.name}</h1>
        {supplier.phone && <p className="text-sm text-muted">{supplier.phone}</p>}
      </div>

      <div className="app-card p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">المستحق عليّ لهذا المورد</div>
          <div className={`text-2xl font-bold ${Number(supplier.balance) > 0 ? "text-red-600" : "text-green-600"}`}>{money(supplier.balance)}</div>
        </div>
      </div>

      <PaySupplierForm supplierId={id} paymentMethods={paymentMethods} />

      <div className="app-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">سجل التعاملات (المشتريات والسداد)</h2>
          <a href={`/api/export/supplier-statement/${id}`} className="text-xs text-primary underline">تحميل كشف الحساب</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right min-w-[600px]">
            <thead>
              <tr className="border-b text-muted">
                <th className="py-2">التاريخ</th><th>النوع</th><th>الكود/الطريقة</th><th>المبلغ</th><th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {ledger.timeline.map((row: any) => (
                <tr key={`${row.kind}-${row.id}`} className="border-b last:border-0">
                  <td className="py-2">{dateAr(row.date)}</td>
                  <td>
                    {row.kind === "PURCHASE" ? <span className="badge badge-amber">مشترى</span> : <span className="badge badge-green">سداد</span>}
                  </td>
                  <td className="text-xs">
                    {row.kind === "PURCHASE" ? (
                      <Link href={`/purchases/${row.id}`} className="text-primary underline">{row.code}</Link>
                    ) : (
                      row.paymentMethodName + (row.transferMethod ? ` - ${row.transferMethod}` : "")
                    )}
                  </td>
                  <td className={row.kind === "PURCHASE" ? "" : "text-green-700"}>
                    {row.kind === "PURCHASE" ? money(row.totalAmount) : `- ${money(row.amount)}`}
                  </td>
                  <td className="text-muted text-xs">{row.note || (row.kind === "PURCHASE" ? `مدفوع منها: ${money(row.paidAmount)}` : "")}</td>
                </tr>
              ))}
              {ledger.timeline.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">مفيش أي تعاملات مسجلة مع المورد ده لسه</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
