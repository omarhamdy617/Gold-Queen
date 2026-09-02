import { getDashboardData } from "@/actions/dashboard";
import { money, num } from "@/lib/format";
import Link from "next/link";
import AlertsBanner from "@/components/AlertsBanner";

export default async function DashboardPage() {
  const d = await getDashboardData();
  const today = new Date().toISOString().slice(0, 10);
  const bannerAlerts = [
    d.largeInvoices.length > 0
      ? { key: `large-${today}-${d.largeInvoices.length}`, text: `فيه ${d.largeInvoices.length} فاتورة بمبلغ كبير اليوم`, href: "/sales" }
      : null,
    d.overLimitCustomers.length > 0
      ? {
          key: `overlimit-${d.overLimitCustomers.map((c) => c.id).join(",")}`,
          text: `تجار تجاوزوا حد الائتمان: ${d.overLimitCustomers.map((c) => c.name).join("، ")}`,
          href: "/customers",
        }
      : null,
    d.pendingReturnsCount > 0
      ? { key: `returns-${d.pendingReturnsCount}`, text: `${d.pendingReturnsCount} مرتجع قيد الموافقة`, href: "/returns" }
      : null,
    d.lowStockCount > 0
      ? { key: `lowstock-${d.lowStockCount}`, text: `${d.lowStockCount} منتج وصل لحد إعادة الطلب`, href: "/products" }
      : null,
  ].filter(Boolean) as { key: string; text: string; href: string }[];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">لوحة تحكم الأدمن</h1>

      <AlertsBanner alerts={bannerAlerts} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="مبيعات اليوم" value={money(d.salesToday)} icon="🧾" accent="primary" />
        <Card
          label="مبيعات الشهر"
          value={money(d.salesMonth)}
          icon="📅"
          accent="navy"
          sub={d.salesChangePct !== null ? `${d.salesChangePct >= 0 ? "▲" : "▼"} ${Math.abs(d.salesChangePct).toFixed(1)}% عن الشهر السابق` : undefined}
        />
        <Card label="إجمالي الربح (هامش)" value={money(d.grossProfit)} icon="📈" accent="emerald" />
        <Card label="صافي الربح بعد المصروفات" value={money(d.netProfit)} icon="💎" accent="emerald" />
        <Card label="إجمالي الكاش" value={money(d.totalCash)} icon="💰" accent="gold" />
        <Card label="مستحق لي" value={money(d.totalReceivable)} icon="⬅️" accent="primary" />
        <Card label="مستحق عليّ" value={money(d.totalPayable)} icon="➡️" accent="rose" />
        <Card label="قيمة المخزون" value={money(d.inventoryValue)} icon="📦" accent="slate" />
      </div>

      <div className="app-card p-5">
        <h2 className="font-bold mb-4 flex items-center gap-2">
          <span className="text-primary">🏆</span> أداء الموظفين هذا الشهر
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead><tr><th className="py-2">الموظف</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th>التحصيلات</th><th></th></tr></thead>
            <tbody>
              {d.employeePerf.map((e) => (
                <tr key={e.userId}>
                  <td className="py-2.5 font-medium">{e.userName}</td><td>{num(e.salesCount)}</td><td>{money(e.salesTotal)}</td><td>{money(e.collections)}</td>
                  <td><Link href="/settings/users" className="text-xs text-primary hover:text-primary-dark">إدارة الصلاحيات</Link></td>
                </tr>
              ))}
              {d.employeePerf.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">لا توجد مبيعات بعد هذا الشهر</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const ACCENTS: Record<string, string> = {
  primary: "bg-gradient-to-br from-primary-light to-primary-dark",
  gold: "bg-gradient-to-br from-gold-light to-gold-dark",
  navy: "bg-gradient-to-br from-neutral-700 to-navy",
  emerald: "bg-gradient-to-br from-emerald-500 to-emerald-700",
  rose: "bg-gradient-to-br from-rose-500 to-rose-700",
  slate: "bg-gradient-to-br from-slate-500 to-slate-700",
};

function Card({ label, value, icon, accent, sub }: { label: string; value: string; icon: string; accent: keyof typeof ACCENTS; sub?: string }) {
  return (
    <div className="app-card p-4 relative overflow-hidden">
      <div className={`absolute -top-4 -left-4 w-16 h-16 rounded-2xl rotate-12 opacity-90 flex items-end justify-start p-2 text-lg ${ACCENTS[accent]}`}>
        <span className="rotate-[-12deg]">{icon}</span>
      </div>
      <div className="text-xs text-muted mt-1">{label}</div>
      <div className="text-xl font-bold mt-1 text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}
