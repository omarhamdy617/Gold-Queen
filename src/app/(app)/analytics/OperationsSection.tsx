"use client";
import LazySection from "./LazySection";
import { getOperationsAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getOperationsAnalytics>>, { error: string }>;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "في الانتظار",
  CONFIRMED: "مؤكد",
  PREPARING: "قيد التجهيز",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  RETURNED: "مرتجع",
  CANCELLED: "ملغي",
};
const RETURN_STATUS_LABELS: Record<string, string> = { PENDING: "في الانتظار", APPROVED: "معتمد", REJECTED: "مرفوض" };

function render(data: Data) {
  const { orderStats, returnsOverview, avgFulfillmentHours, deliveredInPeriod, missingData } = data;
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-bold text-muted mb-2">حالة الأوردرات الحالية (كل الأوردرات، مش مقيّدة بالفترة المختارة)</h4>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {(["PENDING", "CONFIRMED", "PREPARING", "SHIPPED", "DELIVERED", "RETURNED", "CANCELLED"] as const).map((s) => (
            <div key={s} className="app-card p-2.5 text-center">
              <div className="text-[11px] text-muted">{STATUS_LABELS[s]}</div>
              <div className="font-bold">{num((orderStats as any)[s.toLowerCase()] ?? 0)}</div>
            </div>
          ))}
        </div>
        {orderStats.pendingCollection > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">⏳ {num(orderStats.pendingCollection)} أوردر تم تسليمه ولسه محصلش فلوسه</div>
        )}
      </div>

      <div className="app-card p-3">
        <div className="text-xs text-muted">متوسط وقت التسليم (من التسجيل للتسليم) للأوردرات اللي اتسلمت في الفترة</div>
        <div className="font-bold">
          {avgFulfillmentHours === null ? "لا يوجد تسليمات في الفترة دي" : `${(avgFulfillmentHours / 24).toFixed(1)} يوم (${avgFulfillmentHours.toFixed(0)} ساعة)`}
          {deliveredInPeriod > 0 && <span className="text-xs text-muted font-normal"> · {num(deliveredInPeriod)} أوردر</span>}
        </div>
      </div>

      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">المرتجعات في الفترة</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">الحالة</th><th>العدد</th><th>القيمة</th></tr></thead>
          <tbody>
            {returnsOverview.map((r) => (
              <tr key={r.status} className="border-b last:border-0">
                <td className="p-2">{RETURN_STATUS_LABELS[r.status] || r.status}</td>
                <td>{num(r.count)}</td>
                <td className="font-semibold">{money(r.total)}</td>
              </tr>
            ))}
            {returnsOverview.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-muted">لا توجد مرتجعات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted bg-neutral-50 border rounded-lg p-3">📋 بيانات غير متاحة: {missingData}</div>
    </div>
  );
}

export default function OperationsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="operations" title="نظرة عامة على العمليات" icon="🚚" open={open} onToggle={onToggle} loader={getOperationsAnalytics} render={render} />;
}
