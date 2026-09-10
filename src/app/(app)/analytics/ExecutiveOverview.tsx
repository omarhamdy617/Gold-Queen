"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePeriod } from "./PeriodContext";
import { getManagementOverview } from "@/actions/analytics";
import { money, num } from "@/lib/format";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

type Overview = Awaited<ReturnType<typeof getManagementOverview>>;

function ChangeBadge({ pct, goodDirection = "up" }: { pct: number | null; goodDirection?: "up" | "down" }) {
  if (pct === null) return <span className="text-[11px] text-muted">بيانات مش كافية للمقارنة</span>;
  const isUp = pct >= 0;
  const isGood = goodDirection === "up" ? isUp : !isUp;
  const cls = pct === 0 ? "badge-gray" : isGood ? "badge-green" : "badge-red";
  const arrow = pct === 0 ? "→" : isUp ? "↑" : "↓";
  return <span className={`badge ${cls}`}>{arrow} {Math.abs(pct).toFixed(1)}%</span>;
}

function KpiCard({
  label,
  value,
  changePct,
  goodDirection = "up",
  accent,
}: {
  label: string;
  value: string;
  changePct?: number | null;
  goodDirection?: "up" | "down";
  accent?: boolean;
}) {
  return (
    <div className="app-card p-4 space-y-1.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-lg font-bold ${accent ? "text-gold-dark" : ""}`}>{value}</div>
      {changePct !== undefined && <ChangeBadge pct={changePct} goodDirection={goodDirection} />}
    </div>
  );
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-r-4 border-r-red-600 bg-red-50/50",
  warning: "border-r-4 border-r-amber-500 bg-amber-50/50",
  info: "border-r-4 border-r-primary bg-primary/5",
};

export default function ExecutiveOverview() {
  const { periodKey, customFrom, customTo, version } = usePeriod();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const lastLoadedVersion = useRef<number | null>(null);

  useEffect(() => {
    if (lastLoadedVersion.current === version) return;
    lastLoadedVersion.current = version;
    setError("");
    start(async () => {
      try {
        const r = await getManagementOverview(periodKey, customFrom, customTo);
        if (isActionError(r)) {
          setError(r.error);
          setData(null);
          return;
        }
        setData(r as Overview);
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تحميل النظرة التنفيذية"));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  if (error) {
    return <div className="app-card p-6 text-red-600 text-sm">{error}</div>;
  }

  if (!data || isActionError(data)) {
    return <div className="app-card p-8 text-center text-xs text-muted">{pending ? "جارٍ تحميل النظرة التنفيذية..." : "..."}</div>;
  }

  const { kpis, alerts, period: p } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-base">📊 النظرة التنفيذية - {p.label}</h2>
        {pending && <span className="text-[11px] text-muted">جارٍ التحديث...</span>}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="الإيراد (المبيعات)" value={money(kpis.revenue.current)} changePct={kpis.revenue.changePct} />
        <KpiCard label="إجمالي الربح" value={money(kpis.grossProfit.current)} changePct={kpis.grossProfit.changePct} accent />
        <KpiCard label="صافي الربح" value={money(kpis.netProfit.current)} changePct={kpis.netProfit.changePct} accent />
        <KpiCard label="المصروفات" value={money(kpis.expenses.current)} changePct={kpis.expenses.changePct} goodDirection="down" />
        <KpiCard label="عدد الفواتير" value={num(kpis.invoiceCount.current)} changePct={kpis.invoiceCount.changePct} />
        <KpiCard label="متوسط قيمة الفاتورة" value={money(kpis.aov.current)} changePct={kpis.aov.changePct} />
        <KpiCard label="هامش الربح %" value={`${kpis.marginPct.current.toFixed(1)}%`} />
        <KpiCard label="أصناف قريبة من النفاد" value={num(kpis.lowStockCount)} />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="الكاش في الخزائن (الآن)" value={money(kpis.cash)} />
        <KpiCard label="مستحق لينا من العملاء (الآن)" value={money(kpis.receivable)} />
        <KpiCard label="مستحق علينا للموردين (الآن)" value={money(kpis.payable)} />
        <KpiCard label="قيمة المخزون بالتكلفة (الآن)" value={money(kpis.inventoryValue)} />
      </div>

      <div className="app-card p-4 space-y-2.5">
        <h3 className="font-bold text-sm">🔔 تنبيهات وفرص - إيه اللي محتاج قرار دلوقتي</h3>
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`rounded-lg px-3 py-2.5 ${SEVERITY_STYLE[a.severity] || ""}`}>
              <div className="flex items-start gap-2">
                <span className="text-base leading-none">{a.icon}</span>
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="font-semibold text-sm">{a.title}</div>
                  <div className="text-xs text-muted">{a.detail}</div>
                  {a.action && <div className="text-xs font-medium text-navy">💡 {a.action}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
