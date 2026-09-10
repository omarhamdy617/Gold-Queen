"use client";
import LazySection from "./LazySection";
import { getEmployeesAnalytics } from "@/actions/analytics";
import { money, num } from "@/lib/format";

type Data = Exclude<Awaited<ReturnType<typeof getEmployeesAnalytics>>, { error: string }>;

function render(data: Data) {
  const { employeePerf, consignmentLeaderboard, missingData } = data;
  return (
    <div className="space-y-4">
      <div className="app-card overflow-x-auto">
        <h4 className="text-xs font-bold text-muted p-3 pb-1">🏆 أداء الموظفين (مبيعات + تحصيل) في الفترة</h4>
        <table className="w-full text-sm text-right">
          <thead className="border-b text-muted"><tr><th className="p-2">الموظف</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th>التحصيل</th></tr></thead>
          <tbody>
            {employeePerf.map((p) => (
              <tr key={p.userId} className="border-b last:border-0">
                <td className="p-2">{p.userName}</td>
                <td>{num(p.salesCount)}</td>
                <td className="font-semibold text-green-700">{money(p.salesTotal)}</td>
                <td>{money(p.collections)}</td>
              </tr>
            ))}
            {employeePerf.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-muted">لا يوجد نشاط مسجّل في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>

      {consignmentLeaderboard.length > 0 && (
        <div className="app-card overflow-x-auto">
          <h4 className="text-xs font-bold text-muted p-3 pb-1">🎒 ترتيب مبيعات العهدة</h4>
          <table className="w-full text-sm text-right">
            <thead className="border-b text-muted"><tr><th className="p-2">الموظف</th><th>عدد الفواتير</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {consignmentLeaderboard.map((r) => (
                <tr key={r.holderId} className="border-b last:border-0">
                  <td className="p-2">{r.holderName}</td>
                  <td>{num(r.count)}</td>
                  <td className="font-semibold text-green-700">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-xs text-muted bg-neutral-50 border rounded-lg p-3">📋 بيانات غير متاحة: {missingData}</div>
    </div>
  );
}

export default function EmployeesSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return <LazySection id="employees" title="أداء الموظفين" icon="🧑‍💼" open={open} onToggle={onToggle} loader={getEmployeesAnalytics} render={render} />;
}
