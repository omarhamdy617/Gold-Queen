"use client";
import LazySection from "./LazySection";
import { getSalesAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getSalesAnalytics>>, { error: string }>;

function TrendChart({ data }: { data: { day: string; total: number }[] }) {
  if (data.length === 0) return <div className="text-xs text-muted">مفيش مبيعات في الفترة دي</div>;
  const w = 640, h = 140, pad = 10;
  const max = Math.max(1, ...data.map((d) => d.total));
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const points = data
    .map((d, i) => {
      const x = pad + i * stepX;
      const y = h - pad - (d.total / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ direction: "ltr" }}>
        <polyline points={points} fill="none" stroke="#b8860b" strokeWidth={2} />
        {data.map((d, i) => {
          const x = pad + i * stepX;
          const y = h - pad - (d.total / max) * (h - pad * 2);
          return (
            <circle key={i} cx={x} cy={y} r={2.5} fill="#b8860b">
              <title>{`${d.day}: ${money(d.total)}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>{data[0].day}</span>
        <span>{data[data.length - 1].day}</span>
      </div>
    </div>
  );
}

function MiniTable({ title, rows }: { title: string; rows: { label: string; value: string; sub?: string }[] }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-bold text-muted">{title}</h4>
      {rows.length === 0 && <div className="text-xs text-muted">لا يوجد</div>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5">
          <span className="truncate">{r.label}</span>
          <span className="flex items-center gap-2 flex-shrink-0">
            {r.sub && <span className="text-muted">{r.sub}</span>}
            <span className="font-bold text-green-700">{r.value}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function render(data: Data) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-bold text-muted mb-2">اتجاه المبيعات اليومي في الفترة</h4>
        <TrendChart data={data.dailyTrend} />
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <MiniTable title="الإيراد حسب الفئة" rows={data.byCategory.map((c) => ({ label: c.categoryName, value: money(c.revenue), sub: `${num(c.qty)} قطعة` }))} />
        <MiniTable
          title="الإيراد حسب القناة (مصدر الأوردر)"
          rows={data.byChannel.map((c) => ({ label: c.sourceName, value: money(c.current), sub: `${num(c.currentCount)} فاتورة` }))}
        />
        <MiniTable title="الإيراد حسب طريقة الدفع" rows={data.byPaymentMethod.map((c) => ({ label: c.methodName, value: money(c.total), sub: `${num(c.count)} فاتورة` }))} />
        <MiniTable title="الإيراد حسب الفرع" rows={data.byLocation.map((c) => ({ label: c.locationName, value: money(c.total), sub: `${num(c.count)} فاتورة` }))} />
      </div>
    </div>
  );
}

export default function SalesSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="sales" title="تحليل المبيعات" icon="🧾" open={open} onToggle={onToggle} loader={getSalesAnalytics} render={render} />;
}
