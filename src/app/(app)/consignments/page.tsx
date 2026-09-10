import { listConsignments, listEmployees, getOldestPendingItemAge } from "@/actions/consignments";
import { listLocations } from "@/actions/products";
import { listPaymentMethods } from "@/actions/cash";
import { money, num } from "@/lib/format";
import ConsignmentForm from "./ConsignmentForm";
import ConsignmentPanels from "./ConsignmentPanels";
import ConsignmentLimitForm from "./ConsignmentLimitForm";
import ConsignmentLeaderboard from "./ConsignmentLeaderboard";

const STALE_DAYS = 21;

export default async function ConsignmentsPage() {
  // رجّعنا الاستعلامات الخمسة دي تتبعت واحد ورا التاني بدل ما تتزاحم كلها في نفس اللحظة - نفس
  // إصلاح صفحة الأوردرات (شوف التعليق هناك).
  const consignments = await listConsignments();
  const employees = await listEmployees();
  const locations = await listLocations();
  const paymentMethods = await listPaymentMethods();
  const oldestAges = await getOldestPendingItemAge();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">عهدة الموظفين والمناديب</h1>
        <p className="text-xs text-muted mt-1">المندوب/الموظف اللي بيستلم العهدة بيتحدد من قائمة الموظفين المسجلين في السيستم (الإعدادات ← المستخدمين). لو المندوب مش موجود في القايمة، سجله كمستخدم/موظف الأول.</p>
      </div>
      <ConsignmentLeaderboard />
      <ConsignmentForm employees={employees} locations={locations} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {consignments.map((c) => {
          const oldestAt = (oldestAges as Record<string, Date>)[c.id];
          const ageDays = oldestAt ? Math.floor((Date.now() - new Date(oldestAt).getTime()) / (24 * 60 * 60 * 1000)) : null;
          const isStale = ageDays !== null && ageDays >= STALE_DAYS;
          return (
            <div key={c.id} className="app-card p-4 space-y-3">
              {/* الاسم والرصيد المالي جنب بعض في أعلى الكارت - أول حاجة تشوفها بنظرة واحدة */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-base truncate">{c.holderName}</div>
                  {c.limitAmount !== null && c.limitAmount !== undefined && (
                    <div className="text-[10px] text-muted mt-0.5">الحد الأقصى للعهدة: {money(c.limitAmount)}</div>
                  )}
                </div>
                <div className="text-left flex-shrink-0">
                  <div className="text-[10px] text-muted">{Number(c.balance) > 0 ? "عليه" : "رصيده"}</div>
                  <div className={`text-lg font-bold ${Number(c.balance) > 0 ? "text-red-600" : "text-green-600"}`}>{money(c.balance)}</div>
                </div>
              </div>

              {isStale && (
                <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 w-fit">
                  ⚠ فيها بضاعة من {ageDays} يوم لسه معلقة (مترجعتش ولا اتباعت)
                </div>
              )}

              {/* ملخص البضاعة المتبقية معاه فعليًا - قبل كده كان محتاج يفتح "تفاصيل" عشان يعرف الرقم ده */}
              <div className="flex items-center gap-4 bg-neutral-50 rounded-lg px-3 py-2 text-xs">
                <div>
                  <span className="text-muted">🎒 متبقي معاه: </span>
                  <span className="font-bold">{num(c.remainingQty)} قطعة</span>
                </div>
                <div>
                  <span className="text-muted">بقيمة: </span>
                  <span className="font-bold">{money(c.remainingValue)}</span>
                </div>
              </div>

              <ConsignmentLimitForm consignmentId={c.id} currentLimit={c.limitAmount} />

              {/* شلنا زرار "التسوية" (مبلغ نقدي منفصل بيقلل المديونية من غير ما يترتبط ببضاعة
                  فعلية) - كان بيسبب تعارض بين الرصيد المالي وجدول الأصناف (المديونية تقل والبضاعة
                  تفضل شكلها "لسه معاه"). دلوقتي الطريقة الوحيدة لتقليل مديونية الموظف هي فعليًا
                  تسجيل بيع (فاتورة حقيقية) أو رجوع بضاعة - عن طريق تاب "البضاعة" تحت، فالرصيد
                  المالي وجدول الأصناف بيفضلوا متطابقين دايمًا. */}
              <ConsignmentPanels consignmentId={c.id} holderId={c.holderId} locations={locations} paymentMethods={paymentMethods} />
            </div>
          );
        })}
        {consignments.length === 0 && <p className="text-muted text-sm">لا يوجد عهدة مسجلة بعد</p>}
      </div>
    </div>
  );
}
