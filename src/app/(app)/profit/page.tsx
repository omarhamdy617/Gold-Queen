import { getProfitSummary, getProfitBreakdownByProduct, getMonthlyPerformance } from "@/actions/reports";
import { money, num } from "@/lib/format";

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="app-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold mt-1 ${accent ? "text-gold-dark" : ""}`}>{value}</div>
    </div>
  );
}

// رسم بياني بسيط (SVG بحت من غير مكتبات) لاتجاه صافي الربح على آخر N شهر - الأعمدة من اليمين
// لليسار بترتيب زمني (الأقدم يمين، الأحدث شمال) عشان يوافق اتجاه قراءة باقي الشاشة (RTL)
function ProfitTrendChart({ data }: { data: { label: string; netProfit: number }[] }) {
  const chronological = [...data].reverse();
  const maxAbs = Math.max(1, ...chronological.map((m) => Math.abs(m.netProfit)));
  const barW = 48;
  const gap = 14;
  const chartH = 140;
  const width = chronological.length * (barW + gap) + gap;
  const zeroY = chartH / 2;

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(width, 320)} height={chartH + 40} className="min-w-full" style={{ direction: "ltr" }}>
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
              <text x={x + barW / 2} y={chartH + 16} fontSize={10} textAnchor="middle" fill="var(--muted)">
                {m.label.split(" ")[0].slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default async function ProfitPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const { from, to } = await searchParams;
  const toDate = to ? new Date(to + "T23:59:59") : new Date();
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [summary, byProduct, monthly] = await Promise.all([
    getProfitSummary(fromDate, toDate),
    getProfitBreakdownByProduct(fromDate, toDate),
    getMonthlyPerformance(12),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">الأرباح والأداء</h1>
        <p className="text-xs text-muted mt-1">
          إجمالي الربح = هامش البيع (سعر البيع - تكلفة الوحدة) بعد خصم أي مرتجعات بيع معتمدة. صافي الربح = إجمالي الربح ناقص كل المصروفات في نفس الفترة - نفس المعادلة بالظبط المستخدمة في كارتي الربح في لوحة التحكم، عشان الأرقام تتطابق دايمًا مهما فتحت الشاشة دي أو الداشبورد.
        </p>
      </div>

      <form className="flex gap-2 items-end flex-wrap app-card p-4">
        <div>
          <label className="text-xs text-muted block mb-0.5">من</label>
          <input type="date" name="from" defaultValue={fromDate.toISOString().slice(0, 10)} className="border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-muted block mb-0.5">إلى</label>
          <input type="date" name="to" defaultValue={toDate.toISOString().slice(0, 10)} className="border rounded px-3 py-2 text-sm" />
        </div>
        <button className="bg-gold text-white rounded-lg px-4 py-2 text-sm">تحديث</button>
      </form>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="إجمالي المبيعات (الفترة المحددة)" value={money(summary.salesTotal)} />
        <SummaryCard label="إجمالي الربح (هامش)" value={money(summary.grossProfit)} accent />
        <SummaryCard label="المصروفات" value={money(summary.expensesTotal)} />
        <SummaryCard label="صافي الربح" value={money(summary.netProfit)} accent />
      </div>

      <div className="app-card p-4">
        <h2 className="font-bold text-sm mb-1">اتجاه صافي الربح - آخر 12 شهر</h2>
        <p className="text-[11px] text-muted mb-3">الأعمدة الحمرا = شهر خسران (صافي ربح سالب). حرّك الماوس على أي عمود عشان تشوف رقمه بالظبط.</p>
        <ProfitTrendChart data={monthly} />
      </div>

      <div className="app-card overflow-x-auto">
        <h2 className="font-bold text-sm p-4 pb-2">أداء آخر 12 شهر بالتفصيل</h2>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted">
            <tr><th className="p-3">الشهر</th><th>المبيعات</th><th>إجمالي الربح</th><th>المصروفات</th><th>صافي الربح</th></tr>
          </thead>
          <tbody>
            {monthly.map((m) => (
              <tr key={m.label} className="border-b last:border-0">
                <td className="p-3">{m.label}</td>
                <td>{money(m.salesTotal)}</td>
                <td>{money(m.grossProfit)}</td>
                <td>{money(m.expensesTotal)}</td>
                <td className={m.netProfit >= 0 ? "text-green-700 font-bold" : "text-red-600 font-bold"}>{money(m.netProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="app-card overflow-x-auto">
        <h2 className="font-bold text-sm p-4 pb-2">الربح مقسّم حسب المنتج (لنفس الفترة المحددة فوق)</h2>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted">
            <tr><th className="p-3">المنتج</th><th>الكمية المباعة</th><th>الإيراد</th><th>الربح</th></tr>
          </thead>
          <tbody>
            {byProduct.map((p) => (
              <tr key={p.productId} className="border-b last:border-0">
                <td className="p-3">{p.name}</td>
                <td>{num(p.qty)}</td>
                <td>{money(p.revenue)}</td>
                <td className={p.profit >= 0 ? "text-green-700" : "text-red-600"}>{money(p.profit)}</td>
              </tr>
            ))}
            {byProduct.length === 0 && (
              <tr><td colSpan={4} className="py-6 text-center text-muted">لا توجد مبيعات في الفترة دي</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
