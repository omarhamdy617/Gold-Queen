"use client";
import LazySection from "./LazySection";
import { getCustomerAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getCustomerAnalytics>>, { error: string }>;

function render(data: Data) {
  const { newCustomers, topCustomers, newVsReturning, missingData } = data;
  const totalRev = newVsReturning.newRevenue + newVsReturning.returningRevenue;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="app-card p-3">
          <div className="text-xs text-muted">عملاء جدد في الفترة</div>
          <div className="font-bold">{num(newCustomers.current)}</div>
          {newCustomers.changePct !== null && (
            <div className={`text-[11px] ${newCustomers.changePct >= 0 ? "text-green-700" : "text-red-600"}`}>
              {newCustomers.changePct >= 0 ? "+" : ""}{newCustomers.changePct.toFixed(0)}% عن الفترة اللي فاتت
            </div>
          )}
        </div>
        <div className="app-card p-3">
          <div className="text-xs text-muted">إيراد عملاء جدد مقابل قدامى في الفترة</div>
          <div className="flex gap-4 mt-1 text-xs">
            <span><span className="font-semibold text-green-700">{money(newVsReturning.newRevenue)}</span> جدد ({totalRev > 0 ? ((newVsReturning.newRevenue / totalRev) * 100).toFixed(0) : 0}%)</span>
            <span><span className="font-semibold">{money(newVsReturning.returningRevenue)}</span> قدامى ({totalRev > 0 ? ((newVsReturning.returningRevenue / totalRev) * 100).toFixed(0) : 0}%)</span>
          </div>
        </div>
      </div>

      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">👑 أعلى العملاء شراءً في الفترة</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">العميل</th><th>عدد الفواتير</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {topCustomers.map((c, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-2">{c.customerName}</td>
                <td>{num(c.count)}</td>
                <td className="font-semibold text-green-700">{money(c.total)}</td>
              </tr>
            ))}
            {topCustomers.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted">لا توجد مبيعات لعملاء مسجّلين في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted bg-neutral-50 border rounded-lg p-3">📋 بيانات غير متاحة: {missingData}</div>
    </div>
  );
}

export default function CustomersSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="customers" title="تحليل العملاء" icon="👥" open={open} onToggle={onToggle} loader={getCustomerAnalytics} render={render} />;
}
