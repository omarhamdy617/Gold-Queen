import { listTransfers } from "@/actions/transfers";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { dateAr } from "@/lib/format";
import TransferForm from "./TransferForm";

export default async function TransfersPage() {
  const [transfers, products, locations] = await Promise.all([listTransfers(), listProductsWithStock(), listLocations()]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">التحويلات الداخلية (محل ↔ مخزن)</h1>
      <TransferForm products={products} locations={locations} />
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="p-3">الكود</th>
              <th>من</th>
              <th>ملاحظة</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{t.code}</td>
                <td>{t.fromName}</td>
                <td className="text-neutral-500">{t.note}</td>
                <td>{dateAr(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
