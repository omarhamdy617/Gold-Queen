import { listConsignments, listEmployees } from "@/actions/consignments";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { listPaymentMethods } from "@/actions/cash";
import { money } from "@/lib/format";
import ConsignmentForm from "./ConsignmentForm";
import SettleForm from "./SettleForm";
import ConsignmentDetail from "./ConsignmentDetail";
import ConsignmentLimitForm from "./ConsignmentLimitForm";

export default async function ConsignmentsPage() {
  const [consignments, employees, products, locations, paymentMethods] = await Promise.all([
    listConsignments(), listEmployees(), listProductsWithStock(), listLocations(), listPaymentMethods(),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">عهدة الموظفين والمناديب</h1>
      <p className="text-xs text-muted -mt-4">المندوب/الموظف اللي بيستلم العهدة بيتحدد من قائمة الموظفين المسجلين في السيستم (الإعدادات ← المستخدمين). لو المندوب مش موجود في القايمة، سجله كمستخدم/موظف الأول.</p>
      <ConsignmentForm employees={employees} products={products} locations={locations} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {consignments.map((c) => (
          <div key={c.id} className="app-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold">{c.holderName}</div>
              {c.limitAmount !== null && c.limitAmount !== undefined && (
                <div className="text-[10px] text-muted">الحد الأقصى: {money(c.limitAmount)}</div>
              )}
            </div>
            <div className={`text-lg font-bold ${Number(c.balance) > 0 ? "text-red-600" : "text-green-600"}`}>{money(c.balance)}</div>
            <ConsignmentLimitForm consignmentId={c.id} currentLimit={c.limitAmount} />
            <SettleForm consignmentId={c.id} paymentMethods={paymentMethods} consignmentBalance={Number(c.balance)} />
            <ConsignmentDetail consignmentId={c.id} locations={locations} paymentMethods={paymentMethods} />
          </div>
        ))}
        {consignments.length === 0 && <p className="text-muted text-sm">لا يوجد عهدة مسجلة بعد</p>}
      </div>
    </div>
  );
}
