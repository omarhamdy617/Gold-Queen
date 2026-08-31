import { getInvoice } from "@/actions/sales";
import { money, dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";
import DeleteInvoiceButton from "./DeleteInvoiceButton";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getInvoice(id);
  if (!data) return notFound();
  const { invoice, items, customer, createdByName, canEdit } = data;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="no-print flex justify-between items-center">
        {canEdit ? <DeleteInvoiceButton id={id} /> : <span />}
        <PrintButton />
      </div>
      <div className="bg-white rounded-xl shadow p-8 print:shadow-none">
        <PrintHeader subtitle="فاتورة بيع" code={invoice.code} date={dateAr(invoice.createdAt)} />

        <div className="mb-4 text-sm">
          <p><span className="text-neutral-500">العميل: </span>{customer?.name || "عميل نقدي"}</p>
          {customer?.phone && <p><span className="text-neutral-500">الهاتف: </span>{customer.phone}</p>}
          {createdByName && <p className="no-print"><span className="text-neutral-500">سجلها: </span>{createdByName}</p>}
        </div>

        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-b text-neutral-500 text-right">
              <th className="py-2">الصنف</th>
              <th>الكمية</th>
              <th>السعر</th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b last:border-0">
                <td className="py-2">{it.productName}</td>
                <td>{it.quantity}</td>
                <td>{money(it.unitPrice)}</td>
                <td>{money(Number(it.unitPrice) * it.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="space-y-1 text-sm border-t pt-3">
          <div className="flex justify-between"><span>الإجمالي الفرعي</span><span>{money(invoice.subtotal)}</span></div>
          <div className="flex justify-between"><span>الخصم</span><span>{money(invoice.discount)}</span></div>
          <div className="flex justify-between font-bold text-base"><span>الإجمالي</span><span>{money(invoice.total)}</span></div>
          <div className="flex justify-between"><span>المدفوع</span><span>{money(invoice.paidAmount)}</span></div>
          <div className="flex justify-between text-red-600"><span>المتبقي</span><span>{money(Number(invoice.total) - Number(invoice.paidAmount))}</span></div>
        </div>

        <p className="text-center text-xs text-neutral-400 mt-8">شكرًا لتعاملكم مع جولد كوين</p>
      </div>
    </div>
  );
}
