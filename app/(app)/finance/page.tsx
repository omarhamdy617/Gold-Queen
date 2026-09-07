import { getFinancialPosition } from "@/actions/finance";
import { money, num } from "@/lib/format";
import Link from "next/link";

export default async function FinancePage() {
  const f = await getFinancialPosition();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الوضع المالي الشامل</h1>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="إجمالي الكاش في الخزائن" value={money(f.totalCash)} color="bg-green-600" />
        <Card label="مستحق لي (عملاء وتجار)" value={money(f.totalReceivable)} color="bg-blue-600" />
        <Card label="مستحق عليّ (موردين)" value={money(f.totalPayable)} color="bg-red-600" />
        <Card label="مستحق للعملاء (رصيد دائن ليهم)" value={money(f.totalCustomerCredit)} color="bg-orange-600" />
        <Card label="قيمة المخزون بالتكلفة" value={money(f.inventoryValue)} color="bg-amber-600" />
        <Card label="بضاعة عند الموظفين بالتكلفة (عهدة)" value={money(f.consignmentCostValue)} color="bg-purple-600" />
        <Card label="سلف مستحقة لي" value={money(f.totalLoanReceivable)} color="bg-teal-600" />
        <Card label="سلف عليّ (مديون بيها)" value={money(f.totalLoanPayable)} color="bg-rose-600" />
        <Card label="بضاعة الأوردرات الجارية بالتكلفة (قيد التجهيز + في الشحن)" value={money(f.inProgressCostValue)} color="bg-cyan-700" />
        <Card label="أوردرات جارية (قيد التجهيز + في الشحن)" value={num(f.inTransitCount)} color="bg-neutral-700" />
        <Card label="صافي الوضع المالي التقديري" value={money(f.netPosition)} color="bg-gold" wide />
      </div>

      <div className="app-card p-4 bg-neutral-50">
        <div className="text-sm text-muted">
          العائد المتوقع (إجمالي البيع) لو كل الأوردرات الجارية دلوقتي (قيد التجهيز + في الشحن) اتسلمت وتحصّلت بالكامل
        </div>
        <div className="text-2xl font-bold mt-1">{money(f.inProgressExpectedRevenue)}</div>
        <div className="text-xs text-muted mt-1">
          ده رقم استرشادي بس (مش مضمون ومش داخل في صافي الوضع المالي فوق) - بيوريك لو كل حاجة اتسلمت النهارده هتدخل الخزينة قد إيه
        </div>
      </div>

      <div className="app-card p-4">
        <h2 className="font-bold mb-3">تفصيل قيمة المخزون حسب المكان</h2>
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-muted"><th className="py-2">المكان</th><th>الكمية</th><th>القيمة بالتكلفة</th></tr></thead>
          <tbody>
            {f.byLocation.map((l) => (
              <tr key={l.id} className="border-b last:border-0 hover:bg-neutral-50">
                <td className="py-2">
                  <Link href={`/products/by-location?locationId=${l.id}`} className="text-primary underline">{l.name}</Link>
                </td>
                <td>{num(l.qty)}</td><td>{money(l.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, color, wide }: { label: string; value: string; color: string; wide?: boolean }) {
  return (
    <div className={`rounded-xl shadow p-4 text-white ${color} ${wide ? "sm:col-span-2 lg:col-span-4" : ""}`}>
      <div className="text-xs opacity-90">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
