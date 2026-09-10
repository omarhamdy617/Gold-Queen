"use client";
import LazySection from "./LazySection";
import { getMarketingAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getMarketingAnalytics>>, { error: string }>;

function render(data: Data) {
  const { byChannel, missingData } = data;
  const total = byChannel.reduce((s, c) => s + c.current, 0);
  return (
    <div className="space-y-4">
      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">📣 الإيراد حسب قناة/مصدر الأوردر (مقارنة بالفترة اللي فاتت)</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">القناة</th><th>عدد الفواتير</th><th>الإيراد</th><th>% من الإجمالي</th><th>التغيير</th></tr></thead>
          <tbody>
            {byChannel.map((c) => (
              <tr key={c.sourceId} className="border-b last:border-0">
                <td className="p-2">{c.sourceName}</td>
                <td>{num(c.currentCount)}</td>
                <td className="font-semibold text-green-700">{money(c.current)}</td>
                <td>{total > 0 ? ((c.current / total) * 100).toFixed(0) : 0}%</td>
                <td className={c.changePct === null ? "text-muted" : c.changePct >= 0 ? "text-green-700" : "text-red-600"}>
                  {c.changePct === null ? "—" : `${c.changePct > 0 ? "+" : ""}${c.changePct.toFixed(0)}%`}
                </td>
              </tr>
            ))}
            {byChannel.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-muted">لا توجد مبيعات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted bg-neutral-50 border rounded-lg p-3">📋 بيانات غير متاحة: {missingData}</div>
    </div>
  );
}

export default function MarketingSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="marketing" title="التسويق" icon="📣" open={open} onToggle={onToggle} loader={getMarketingAnalytics} render={render} />;
}
