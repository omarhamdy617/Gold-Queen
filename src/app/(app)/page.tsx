import { getDashboardData } from "@/actions/dashboard";
import { money, num } from "@/lib/format";
import Link from "next/link";

export default async function DashboardPage() {
  const d = await getDashboardData();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">لوحة تحكم الأدمن</h1>

      {(d.largeInvoices.length > 0 || d.overLimitCustomers.length > 0 || d.pendingReturnsCount > 0 || d.lowStockCount > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1 text-sm">
          <h2 className="font-bold text-red-700 mb-2">🔔 تنبيهات فورية</h2>
          {d.largeInvoices.length > 0 && <p>فيه {d.largeInvoices.length} فاتورة بمبلغ كبير اليوم</p>}
          {d.overLimitCustomers.length > 0 && (
            <p>تجار تجاوزوا حد الائتمان: {d.overLimitCustomers.map((c) => c.name).join("، ")}</p>
          )}
          {d.pendingReturnsCount > 0 && <p><Link href="/returns" className="underline">{d.pendingReturnsCount} مرتجع قيد الموافقة</Link></p>}
          {d.lowStockCount > 0 && <p><Link href="/products" className="underline">{d.lowStockCount} منتج وصل لحد إعادة الطلب</Link></p>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="مبيعات اليوم" value={money(d.salesToday)} color="bg-blue-600" />
        <Card
          label="مبيعات الشهر"
          value={money(d.salesMonth)}
          color="bg-blue-700"
          sub={d.salesChangePct !== null ? `${d.salesChangePct >= 0 ? "▲" : "▼"} ${Math.abs(d.salesChangePct).toFixed(1)}% عن الشهر السابق` : undefined}
        />
        <Card label="إجمالي الربح (هامش)" value={money(d.grossProfit)} color="bg-green-600" />
        <Card label="صافي الربح بعد المصروفات" value={money(d.netProfit)} color="bg-green-700" />
        <Card label="إجمالي الكاش" value={money(d.totalCash)} color="bg-amber-600" />
        <Card label="مستحق لي" value={money(d.totalReceivable)} color="bg-purple-600" />
        <Card label="مستحق عليّ" value={money(d.totalPayable)} color="bg-red-600" />
        <Card label="قيمة المخزون" value={money(d.inventoryValue)} color="bg-neutral-700" />
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-bold mb-3">أداء الموظفين هذا الشهر</h2>
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-neutral-500"><th className="py-2">الموظف</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th>التحصيلات</th><th></th></tr></thead>
          <tbody>
            {d.employeePerf.map((e) => (
              <tr key={e.userId} className="border-b last:border-0">
                <td className="py-2">{e.userName}</td><td>{num(e.salesCount)}</td><td>{money(e.salesTotal)}</td><td>{money(e.collections)}</td>
                <td><Link href="/settings/users" className="text-xs text-gold">إدارة الصلاحيات</Link></td>
              </tr>
            ))}
            {d.employeePerf.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-400">لا توجد مبيعات بعد هذا الشهر</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div className={`rounded-xl shadow p-4 text-white ${color}`}>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-80 mt-1">{sub}</div>}
    </div>
  );
}
