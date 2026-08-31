import { listTransfers } from "@/actions/transfers";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { dateAr } from "@/lib/format";
import TransferForm from "./TransferForm";
import Link from "next/link";

export default async function TransfersPage() {
  const [transfers, products, locations] = await Promise.all([listTransfers(), listProductsWithStock(), listLocations()]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">التحويلات الداخلية (محل ↔ مخزن)</h1>
      <TransferForm products={products} locations={locations} />
      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-muted">
              <th className="p-3">الكود</th>
              <th>من</th>
              <th>إلى</th>
              <th>ملاحظة</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-neutral-50">
                <td className="p-3 font-mono text-xs">
                  <Link href={`/transfers/${t.id}`} className="text-primary underline">{t.code}</Link>
                </td>
                <td>{t.fromName}</td>
                <td>{t.toName}</td>
                <td className="text-muted">{t.note}</td>
                <td>{dateAr(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
