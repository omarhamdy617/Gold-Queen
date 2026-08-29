import { listOrders } from "@/actions/orders";
import { listProductsWithStock } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { dateAr } from "@/lib/format";
import OrderForm from "./OrderForm";
import StatusControl from "./StatusControl";

export default async function OrdersPage() {
  const [orders, products, customers] = await Promise.all([listOrders(), listProductsWithStock(), listCustomers()]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الأوردرات والشحن</h1>
      <OrderForm products={products} customers={customers} />
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right min-w-[900px]">
          <thead>
            <tr className="border-b text-neutral-500">
              <th className="p-3">الكود</th><th>العميل</th><th>المصدر</th><th>الشحن</th><th>مدفوع مقدمًا</th><th>الحالة</th><th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{o.code}</td>
                <td>{o.customerName || "-"}</td>
                <td>{sourceLabel(o.source)}</td>
                <td>{shipLabel(o.shippingMethod)} {o.courierName || o.shippingCompanyName}</td>
                <td>{o.prepaid ? "نعم" : "لا"}</td>
                <td><StatusControl orderId={o.id} status={o.status} /></td>
                <td>{dateAr(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function sourceLabel(s: string) { return { WEBSITE: "الموقع", PHONE: "تليفون", WHATSAPP: "واتساب", FACEBOOK: "فيسبوك", OTHER: "أخرى" }[s] || s; }
function shipLabel(s: string) { return { INTERNAL_COURIER: "مندوب داخلي", EXTERNAL_COMPANY: "شركة شحن", OTHER: "أخرى" }[s] || s; }
