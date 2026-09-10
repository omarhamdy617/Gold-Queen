"use client";
import LazySection from "./LazySection";
import { getFinancialAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getFinancialAnalytics>>, { error: string }>;

function MonthlyTrendChart({ data }: { data: Data["monthlyTrend"] }) {
  const chronological = [...data].reverse();
  const maxAbs = Math.max(1, ...chronological.map((m) => Math.abs(m.netProfit)));
  const barW = 40;
  const gap = 12;
  const chartH = 120;
  const width = chronological.length * (barW + gap) + gap;
  const zeroY = chartH / 2;
  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(width, 320)} height={chartH + 36} className="min-w-full" style={{ direction: "ltr" }}>
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="var(--border)" strokeWidth={1} />
        {chronological.map((m, i) => {
          const h = (Math.abs(m.netProfit) / maxAbs) * (chartH / 2 - 6);
          const x = gap + i * (barW + gap);
          const isPos = m.netProfit >= 0;
          const y = isPos ? zeroY - h : zeroY;
          return (
            <g key={i}>
              <title>{`${m.label}: ${money(m.netProfit)}`}</title>
              <rect x={x} y={y} width={barW} height={Math.max(h, 1)} rx={3} fill={isPos ? "#16794f" : "#c0392b"} opacity={0.85} />
              <text x={x + barW / 2} y={chartH + 14} fontSize={9} textAnchor="middle" fill="var(--muted)">
                {m.label.split(" ")[0].slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function render(data: Data) {
  const { summary, byProduct, monthlyTrend, expenseCategories, cashFlow } = data;
  const topProfit = [...byProduct].sort((a, b) => b.profit - a.profit).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="app-card p-3"><div className="text-xs text-muted">المبيعات</div><div className="font-bold">{money(summary.salesTotal)}</div></div>
        <div className="app-card p-3"><div className="text-xs text-muted">إجمالي الربح</div><div className="font-bold text-gold-dark">{money(summary.grossProfit)}</div></div>
        <div className="app-card p-3"><div className="text-xs text-muted">المصروفات</div><div className="font-bold">{money(summary.expensesTotal)}</div></div>
        <div className="app-card p-3"><div className="text-xs text-muted">صافي الربح</div><div className={`font-bold ${summary.netProfit >= 0 ? "text-green-700" : "text-red-600"}`}>{money(summary.netProfit)}</div></div>
      </div>

      <div>
        <h4 className="text-xs font-bold text-muted mb-2">اتجاه صافي الربح - آخر 12 شهر (ثابت بغض النظر عن الفترة المختارة فوق، زي شاشة "الأرباح والأداء")</h4>
        <MonthlyTrendChart data={monthlyTrend} />
      </div>

      <div className="app-card p-3 space-y-2">
        <h4 className="text-xs font-bold text-muted">التدفق النقدي الفعلي في الفترة (فلوس داخلة وخارجة من الشركة فعليًا)</h4>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><div className="text-[11px] text-muted">داخل</div><div className="font-bold text-green-700">{money(cashFlow.in)}</div></div>
          <div><div className="text-[11px] text-muted">خارج</div><div className="font-bold text-red-600">{money(cashFlow.out)}</div></div>
          <div><div className="text-[11px] text-muted">الصافي</div><div className={`font-bold ${cashFlow.net >= 0 ? "text-green-700" : "text-red-600"}`}>{money(cashFlow.net)}</div></div>
        </div>
        {cashFlow.adjustments > 0 && (
          <div className="text-[11px] text-muted">+ {money(cashFlow.adjustments)} تسويات يدوية على الخزينة في الفترة دي (اتجاهها زيادة أو نقصان مش متسجل بشكل منفصل).</div>
        )}
      </div>

      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">المصروفات حسب الفئة (مقارنة بالفترة اللي فاتت)</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">الفئة</th><th>الفترة الحالية</th><th>الفترة اللي فاتت</th><th>التغيير</th></tr></thead>
          <tbody>
            {expenseCategories.map((c) => (
              <tr key={c.categoryId} className="border-b last:border-0">
                <td className="p-2">{c.categoryName}</td>
                <td>{money(c.current)}</td>
                <td className="text-muted">{money(c.previous)}</td>
                <td className={c.changePct === null ? "text-muted" : c.changePct > 0 ? "text-red-600" : "text-green-700"}>
                  {c.changePct === null ? "—" : `${c.changePct > 0 ? "+" : ""}${c.changePct.toFixed(0)}%`}
                </td>
              </tr>
            ))}
            {expenseCategories.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted">لا توجد مصروفات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">أعلى المنتجات ربحًا في الفترة</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">المنتج</th><th>الكمية</th><th>الإيراد</th><th>الربح</th></tr></thead>
          <tbody>
            {topProfit.map((p) => (
              <tr key={p.productId} className="border-b last:border-0">
                <td className="p-2">{p.name}</td>
                <td>{num(p.qty)}</td>
                <td>{money(p.revenue)}</td>
                <td className={p.profit >= 0 ? "text-green-700 font-semibold" : "text-red-600 font-semibold"}>{money(p.profit)}</td>
              </tr>
            ))}
            {topProfit.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted">لا توجد مبيعات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinancialSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="financial" title="الأرباح والوضع المالي" icon="💹" open={open} onToggle={onToggle} loader={getFinancialAnalytics} render={render} />;
}
