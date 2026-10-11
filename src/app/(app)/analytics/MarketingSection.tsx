"use client";
import LazySection from "./LazySection";
import { getMarketingAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getMarketingAnalytics>>, { error: string }>;

function roasText(roas: number | null) {
  return roas === null ? "—" : `${roas.toFixed(1)}x`;
}

function render(data: Data) {
  const { byChannel, totals, missingData } = data;
  const total = byChannel.reduce((s, c) => s + c.current, 0);
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="app-card p-3">
          <div className="text-xs text-muted">مصاريف الإعلانات في الفترة</div>
          <div className="font-bold">{money(totals.adSpend)}</div>
        </div>
        <div className="app-card p-3">
          <div className="text-xs text-muted">مبيعات القنوات اللي عليها إعلانات</div>
          <div className="font-bold text-green-700">{money(totals.paidRevenue)}</div>
        </div>
        <div className="app-card p-3">
          <div className="text-xs text-muted">ROAS الإجمالي</div>
          <div className={`font-bold ${totals.blendedRoas !== null && totals.blendedRoas < 1 ? "text-red-600" : ""}`}>{roasText(totals.blendedRoas)}</div>
          <div className="text-[11px] text-muted mt-0.5">كل جنيه إعلانات جاب كام جنيه مبيعات</div>
        </div>
      </div>

      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">📣 كل قناة: مبيعاتها، ومصاريف إعلاناتها، وربحها بعد الإعلانات</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted">
            <tr>
              <th className="p-2">القناة</th>
              <th>الفواتير</th>
              <th>الإيراد</th>
              <th>% من الإجمالي</th>
              <th>التغيير</th>
              <th>مصاريف الإعلانات</th>
              <th>ROAS</th>
              <th>الربح بعد الإعلانات</th>
            </tr>
          </thead>
          <tbody>
            {byChannel.map((c) => (
              <tr key={c.sourceId} className="border-b last:border-0">
                <td className="p-2">{c.sourceName}</td>
                <td className="tabular-nums">{num(c.currentCount)}</td>
                <td className="font-semibold text-green-700 tabular-nums">{money(c.current)}</td>
                <td className="tabular-nums">{total > 0 ? ((c.current / total) * 100).toFixed(0) : 0}%</td>
                <td className={c.changePct === null ? "text-muted" : c.changePct >= 0 ? "text-green-700" : "text-red-600"}>
                  {c.changePct === null ? "—" : `${c.changePct > 0 ? "+" : ""}${c.changePct.toFixed(0)}%`}
                </td>
                <td className="tabular-nums">{c.adSpend > 0 ? money(c.adSpend) : <span className="text-muted">—</span>}</td>
                <td className={`tabular-nums font-semibold ${c.roas !== null && c.roas < 1 ? "text-red-600" : ""}`}>{roasText(c.roas)}</td>
                <td className={`tabular-nums font-semibold ${c.profitAfterAds < 0 ? "text-red-600" : "text-green-700"}`}>{money(c.profitAfterAds)}</td>
              </tr>
            ))}
            {byChannel.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-muted">لا توجد مبيعات ولا مصاريف إعلانات في الفترة دي</td></tr>}
          </tbody>
        </table>
        <p className="text-[11px] text-muted px-3 pb-3 pt-1">
          الـROAS = الإيراد ÷ مصاريف الإعلانات. "الربح بعد الإعلانات" = هامش الربح من مبيعات القناة (سعر البيع − تكلفة الصنف) ناقص إعلاناتها، وده الأهم: قناة الـROAS بتاعها عالي ممكن تبقى خسرانة لو هامش المنتجات اللي بتتباع منها قليل. مصاريف الإعلانات بتتسجل من شاشة المصروفات باختيار "قناة الإعلان".
        </p>
      </div>
      <div className="text-xs text-muted bg-neutral-50 border rounded-lg p-3">📋 ملحوظة: {missingData}</div>
    </div>
  );
}

export default function MarketingSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="marketing" title="التسويق" icon="📣" open={open} onToggle={onToggle} loader={getMarketingAnalytics} render={render} />;
}
