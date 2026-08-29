import { listReturns } from "@/actions/returns";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { listSuppliers } from "@/actions/purchases";
import { listPaymentMethods } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";
import ReturnForm from "./ReturnForm";
import ApproveControls from "./ApproveControls";

export default async function ReturnsPage() {
  const [returns, products, customers, suppliers, locations, paymentMethods] = await Promise.all([
    listReturns(), listProductsWithStock(), listCustomers(), listSuppliers(), listLocations(), listPaymentMethods(),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">المرتجعات (لازم اعتماد أدمن)</h1>
      <ReturnForm products={products} customers={customers} suppliers={suppliers} />
      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm text-right min-w-[900px]">
          <thead>
            <tr className="border-b text-muted">
              <th className="p-3">الكود</th><th>النوع</th><th>المبلغ</th><th>السبب</th><th>ملاحظات</th><th>صورة</th><th>الحالة</th><th>التاريخ</th><th></th>
            </tr>
          </thead>
          <tbody>
            {returns.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{r.code}</td>
                <td>{r.kind === "SALE_RETURN" ? "مرتجع بيع" : "مرتجع شراء"}</td>
                <td>{money(r.totalAmount)}</td>
                <td className="text-muted text-xs">{r.reasonCategory}</td>
                <td className="text-muted text-xs max-w-[160px]">{r.reason}</td>
                <td>{r.imageUrl && <a href={r.imageUrl} target="_blank" className="text-primary text-xs underline">عرض</a>}</td>
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
