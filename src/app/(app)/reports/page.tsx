import { bestSellers } from "@/actions/products";
import { money, num } from "@/lib/format";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(new Date().setMonth(new Date().getMonth() - 1));
  const rows = await bestSellers(fromDate, toDate);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">تقرير الأكثر مبيعًا</h1>
      <form className="flex gap-2 items-end flex-wrap bg-white rounded-xl shadow p-4">
        <div><label className="text-xs text-neutral-500 block">من</label><input type="date" name="from" defaultValue={fromDate.toISOString().slice(0, 10)} className="border rounded px-3 py-2 text-sm" /></div>
        <div><label className="text-xs text-neutral-500 block">إلى</label><input type="date" name="to" defaultValue={toDate.toISOString().slice(0, 10)} className="border rounded px-3 py-2 text-sm" /></div>
        <button className="bg-gold text-white rounded-lg px-4 py-2 text-sm">تحديث</button>
      </form>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-neutral-500"><th className="p-3">#</th><th>المنتج</th><th>الوحدات المباعة</th><th>الإيراد</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.productId} className="border-b last:border-0">
                <td className="p-3">{i + 1}</td><td>{r.name}</td><td>{num(r.qty)}</td><td>{money(r.revenue)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-neutral-400">لا توجد مبيعات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
