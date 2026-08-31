import { getTransfer } from "@/actions/transfers";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import EditTransferForm from "./EditTransferForm";

export default async function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, products, locations] = await Promise.all([getTransfer(id), listProductsWithStock(), listLocations()]);
  if (!data) return notFound();
  const { transfer, items, canEdit } = data;
  const locMap: Record<string, string> = {};
  for (const l of locations) locMap[l.id] = l.name;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link href="/transfers" className="text-xs text-primary underline">← كل التحويلات</Link>
        <h1 className="text-xl font-bold mt-1">تحويل {transfer.code}</h1>
      </div>

      <div className="app-card p-4 grid sm:grid-cols-2 gap-3 text-sm">
        <div><span className="text-muted">من: </span>{locMap[transfer.fromLocationId]}</div>
        <div><span className="text-muted">إلى: </span>{locMap[transfer.toLocationId]}</div>
        <div><span className="text-muted">التاريخ: </span>{dateAr(transfer.createdAt)}</div>
        <div><span className="text-muted">سجله: </span>{transfer.createdByName || "-"}</div>
        {transfer.note && <div className="sm:col-span-2"><span className="text-muted">ملاحظة: </span>{transfer.note}</div>}
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold">الأصناف المحوّلة</h2>
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-muted"><th className="py-2">المنتج</th><th>الكمية</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b last:border-0"><td className="py-2">{it.productName}</td><td>{it.quantity}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && <EditTransferForm transfer={transfer} items={items} products={products} locations={locations} />}
    </div>
  );
}
