import { listReturns } from "@/actions/returns";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { listPaymentMethods } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";
import ReturnForm from "./ReturnForm";
import ApproveControls from "./ApproveControls";

export default async function ReturnsPage() {
  const [returns, products, customers, locations, paymentMethods] = await Promise.all([
    listReturns(), listProductsWithStock(), listCustomers(), listLocations(), listPaymentMethods(),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">المرتجعات (لازم اعتماد أدمن)</h1>
      <ReturnForm products={products} customers={customers} />
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right min-w-[800px]">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="p-3">الكود</th><th>النوع</th><th>المبلغ</th><th>السبب</th><th>الحالة</th><th>التاريخ</th><th></th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{r.code}</td>
                <td>{r.kind === "SALE_RETURN" ? "مرتجع بيع" : "مرتجع شراء"}</td>
                <td>{money(r.totalAmount)}</td>
                <td className="text-neutral-500">{r.reason}</td>
                <td>{statusBadge(r.status)}</td>
                <td>{dateAr(r.createdAt)}</td>
                <td>{r.status === "PENDING" && <ApproveControls id={r.id} locations={locations} paymentMethods={paymentMethods} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function statusBadge(s: string) {
  const map: Record<string, string> = { PENDING: "🟡 قيد الموافقة", APPROVED: "🟢 معتمد", REJECTED: "🔴 مرفوض" };
  return map[s] || s;
}
