import { listConsignments, listEmployees } from "@/actions/consignments";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { money } from "@/lib/format";
import ConsignmentForm from "./ConsignmentForm";
import SettleForm from "./SettleForm";

export default async function ConsignmentsPage() {
  const [consignments, employees, products, locations] = await Promise.all([
    listConsignments(), listEmployees(), listProductsWithStock(), listLocations(),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">عهدة الموظفين والمناديب</h1>
      <ConsignmentForm employees={employees} products={products} locations={locations} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {consignments.map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow p-4 space-y-2">
            <div className="font-bold">{c.holderName}</div>
            <div className={`text-lg font-bold ${Number(c.balance) > 0 ? "text-red-600" : "text-green-600"}`}>{money(c.balance)}</div>
            <SettleForm consignmentId={c.id} />
          </div>
        ))}
        {consignments.length === 0 && <p className="text-neutral-400 text-sm">لا يوجد عهدة مسجلة بعد</p>}
      </div>
    </div>
  );
}
