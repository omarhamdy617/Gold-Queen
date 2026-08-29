import { listPurchases, listSuppliers } from "@/actions/purchases";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { listPaymentMethods } from "@/actions/cash";
import { money, dateAr } from "@/lib/format";
import PurchaseForm from "./PurchaseForm";

export default async function PurchasesPage() {
  const [purchases, suppliers, products, locations, paymentMethods] = await Promise.all([
    listPurchases(),
    listSuppliers(),
    listProductsWithStock(),
    listLocations(),
    listPaymentMethods(),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">المشتريات</h1>
      <PurchaseForm suppliers={suppliers} products={products} locations={locations} paymentMethods={paymentMethods} />
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="p-3">الكود</th>
              <th>المورد</th>
              <th>المكان</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>الحالة</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{p.code}</td>
                <td>{p.supplierName}</td>
                <td>{p.locationName}</td>
                <td>{money(p.totalAmount)}</td>
                <td>{money(p.paidAmount)}</td>
                <td>{statusLabel(p.paymentStatus)}</td>
                <td>{dateAr(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function statusLabel(s: string) {
  return { PAID: "مدفوع", UNPAID: "آجل", PARTIAL: "جزئي" }[s] || s;
}
