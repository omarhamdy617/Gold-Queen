"use client";
import LazySection from "./LazySection";
import { getInventoryPurchasingAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getInventoryPurchasingAnalytics>>, { error: string }>;

function render(data: Data) {
  const { reorderAlerts, purchasing, purchaseCount, topSuppliers, inventoryByLocation } = data;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="app-card p-3">
          <div className="text-xs text-muted">إجمالي المشتريات في الفترة</div>
          <div className="font-bold">{money(purchasing.current)} <span className="text-xs text-muted font-normal">({num(purchaseCount)} فاتورة شراء)</span></div>
        </div>
        <div className="app-card p-3">
          <div className="text-xs text-muted">قيمة المخزون بالتكلفة حسب الفرع (الآن)</div>
          <div className="flex gap-3 flex-wrap mt-1">
            {inventoryByLocation.map((l) => (
              <span key={l.name} className="text-xs"><span className="font-semibold">{l.name}:</span> {money(l.value)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">🚨 أصناف على وشك النفاد (معدل بيع آخر 30 يوم يقول هتخلص خلال أسبوعين)</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">المنتج</th><th>الرصيد الحالي</th><th>معدل البيع اليومي</th><th>متبقي (يوم)</th></tr></thead>
          <tbody>
            {reorderAlerts.smart.map((p: any) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-2">{p.name}</td>
                <td>{num(p.totalStock)}</td>
                <td>{p.dailyRate.toFixed(2)}</td>
                <td className="text-red-600 font-semibold">{p.daysLeft.toFixed(0)}</td>
              </tr>
            ))}
            {reorderAlerts.smart.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted">مفيش أصناف مهددة بالنفاد قريب 👍</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">📉 أصناف تحت الحد الأدنى المسجل (حد يدوي)</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">المنتج</th><th>الرصيد الحالي</th><th>الحد الأدنى</th></tr></thead>
          <tbody>
            {reorderAlerts.manual.map((p: any) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-2">{p.name}</td>
                <td>{num(p.totalStock)}</td>
                <td>{num(p.reorderPoint)}</td>
              </tr>
            ))}
            {reorderAlerts.manual.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted">لا يوجد</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">أكبر الموردين شراءً في الفترة</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">المورد</th><th>عدد الفواتير</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {topSuppliers.map((s, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-2">{s.supplierName}</td>
                <td>{num(s.count)}</td>
                <td className="font-semibold">{money(s.total)}</td>
              </tr>
            ))}
            {topSuppliers.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted">لا توجد مشتريات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InventorySection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="inventory" title="المخزون والمشتريات" icon="🏭" open={open} onToggle={onToggle} loader={getInventoryPurchasingAnalytics} render={render} />;
}
