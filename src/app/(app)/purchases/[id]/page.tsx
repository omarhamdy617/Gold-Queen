import { getPurchase } from "@/actions/purchases";
import { money, dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import DeletePurchaseButton from "./DeletePurchaseButton";

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPurchase(id);
  if (!data) return notFound();
  const { purchase, items, canEdit } = data;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/purchases" className="text-xs text-primary underline">← كل فواتير المشتريات</Link>
          <h1 className="text-xl font-bold mt-1">فاتورة شراء {purchase.code}</h1>
        </div>
        {canEdit && <DeletePurchaseButton id={purchase.id} />}
      </div>

      <div className="app-card p-4 grid sm:grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted">المورد: </span>
          <Link href={`/suppliers/${purchase.supplierId}`} className="text-primary underline">{purchase.supplierName}</Link>
        </div>
        <div><span className="text-muted">المكان: </span>{purchase.locationName}</div>
        <div><span className="text-muted">التاريخ: </span>{dateAr(purchase.createdAt)}</div>
        <div><span className="text-muted">سجلها: </span>{purchase.createdByName || "-"}</div>
        <div><span className="text-muted">الحالة: </span>{statusLabel(purchase.paymentStatus)}</div>
        <div><span className="text-muted">الإجمالي: </span><span className="font-bold">{money(purchase.totalAmount)}</span></div>
        <div><span className="text-muted">المدفوع: </span>{money(purchase.paidAmount)}</div>
        <div><span className="text-muted">المتبقي: </span>{money(Number(purchase.totalAmount) - Number(purchase.paidAmount))}</div>
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">الأصناف</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right min-w-[500px]">
            <thead>
              <tr className="border-b text-muted">
                <th className="py-2">المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b last:border-0">
                  <td className="py-2">{it.productName}</td>
                  <td>{it.quantity}</td>
                  <td>{money(it.unitCost)}</td>
                  <td>{money(Number(it.quantity) * Number(it.unitCost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function statusLabel(s: string) {
  return { PAID: "مدفوع", UNPAID: "آجل", PARTIAL: "جزئي" }[s] || s;
}
