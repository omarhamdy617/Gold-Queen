import { getFinancialPosition } from "@/actions/finance";
import { money, num } from "@/lib/format";
import Link from "next/link";

export default async function FinancePage() {
  const f = await getFinancialPosition();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الوضع المالي الشامل</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="إجمالي الكاش في الخزائن" value={money(f.totalCash)} color="bg-green-600" />
        <Card label="مستحق لي (عملاء وتجار)" value={money(f.totalReceivable)} color="bg-blue-600" />
        <Card label="مستحق عليّ (موردين)" value={money(f.totalPayable)} color="bg-red-600" />
        <Card label="قيمة المخزون بالتكلفة" value={money(f.inventoryValue)} color="bg-amber-600" />
        <Card label="بضاعة عند الموظفين (عهدة)" value={money(f.totalConsignmentValue)} color="bg-purple-600" />
        <Card label="أوردرات في الطريق" value={num(f.inTransitCount)} color="bg-neutral-700" />
        <Card label="صافي الوضع المالي التقديري" value={money(f.netPosition)} color="bg-gold" wide />
      </div>

      <div className="app-card p-4">
        <h2 className="font-bold mb-3">تفصيل قيمة المخزون حسب المكان</h2>
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-muted"><th className="py-2">المكان</th><th>الكمية</th><th>القيمة بالتكلفة</th></tr></thead>
          <tbody>
            {f.byLocation.map((l) => (
              <tr key={l.id} className="border-b last:border-0 hover:bg-neutral-50">
                <td className="py-2">
                  <Link href={`/products/by-location?locationId=${l.id}`} className="text-primary underline">{l.name}</Link>
                </td>
                <td>{num(l.qty)}</td><td>{money(l.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, color, wide }: { label: string; value: string; color: string; wide?: boolean }) {
  return (
    <div className={`rounded-xl shadow p-4 text-white ${color} ${wide ? "sm:col-span-2 lg:col-span-4" : ""}`}>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
