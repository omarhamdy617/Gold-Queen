import { listLocations, getInventoryByLocation } from "@/actions/products";
import { money, num } from "@/lib/format";
import Link from "next/link";

export default async function InventoryByLocationPage({ searchParams }: { searchParams: Promise<{ locationId?: string }> }) {
  const { locationId } = await searchParams;
  const locations = await listLocations();
  const activeId = locationId || locations[0]?.id;
  const data = activeId ? await getInventoryByLocation(activeId) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/products" className="text-xs text-primary underline">← المنتجات والمخزون</Link>
        <h1 className="text-xl font-bold mt-1">المخزون حسب المكان</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {locations.map((l) => (
          <Link
            key={l.id}
            href={`/products/by-location?locationId=${l.id}`}
            className={`text-sm rounded-lg px-4 py-2 border ${activeId === l.id ? "bg-primary text-white border-primary" : "bg-white text-muted"}`}
          >
            {l.name}
          </Link>
        ))}
      </div>

      {data && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="app-card p-4">
              <div className="text-xs text-muted">إجمالي عدد القطع في المكان ده</div>
              <div className="text-2xl font-bold">{num(data.totalQuantity)}</div>
            </div>
            <div className="app-card p-4">
              <div className="text-xs text-muted">قيمة المخزون (بسعر التكلفة)</div>
              <div className="text-2xl font-bold">{money(data.totalValue)}</div>
            </div>
          </div>

          <div className="app-card overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b text-muted">
                  <th className="p-3">المنتج</th><th>الباركود</th><th>الكمية</th><th>متوسط التكلفة</th><th>قيمة المخزون</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.productId} className="border-b last:border-0">
                    <td className="p-3">{r.productName}</td>
                    <td className="font-mono text-xs">{r.barcode}</td>
                    <td>{num(r.quantity)}</td>
                    <td>{money(r.avgCost)}</td>
                    <td className="font-bold">{money(r.costValue)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-muted">مفيش أي مخزون في المكان ده</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
