import { listOrders, listCouriers, listShippingCompanies } from "@/actions/orders";
import { listProductsWithStock } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { can } from "@/lib/auth";
import { dateAr } from "@/lib/format";
import OrderForm from "./OrderForm";
import StatusControl from "./StatusControl";
import ShippingAssignForm from "./ShippingAssignForm";

export default async function OrdersPage() {
  const canShip = await can("orders.ship");
  const [orders, products, customers, couriers, shippingCompanies] = await Promise.all([
    listOrders(),
    listProductsWithStock(),
    listCustomers(),
    canShip ? listCouriers() : Promise.resolve([]),
    canShip ? listShippingCompanies() : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الأوردرات والشحن</h1>
      <OrderForm products={products} customers={customers} />
      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm text-right min-w-[1100px]">
          <thead>
            <tr className="border-b text-muted">
              <th className="p-3">الكود</th><th>العميل</th><th>الهاتف</th><th>العنوان</th><th>المحافظة</th><th>المصدر</th><th>الشحن</th><th>مدفوع مقدمًا</th><th>الحالة</th><th>التاريخ</th>
              {canShip && <th>تحديد الشحن</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b last:border-0 align-top">
                <td className="p-3 font-mono text-xs">{o.code}</td>
                <td>{o.customerName || "-"}</td>
                <td className="text-xs">{o.customerPhone}{o.customerPhone2 ? ` / ${o.customerPhone2}` : ""}</td>
                <td className="text-xs max-w-[160px]">{o.address}{o.deliveryNotes ? <div className="text-muted">ملاحظات: {o.deliveryNotes}</div> : null}</td>
                <td className="text-xs">{o.governorate}</td>
                <td>{sourceLabel(o.source)}</td>
                <td className="text-xs">{o.shippingMethod ? `${shipLabel(o.shippingMethod)} - ${o.courierName || o.shippingCompanyName || ""}` : "-"}</td>
                <td>{o.prepaid ? "نعم" : "لا"}</td>
                <td><StatusControl orderId={o.id} status={o.status} canEdit={canShip} /></td>
                <td className="text-xs">{dateAr(o.createdAt)}</td>
                {canShip && (
                  <td className="p-2">
                    {!o.shippingMethod ? (
                      <ShippingAssignForm orderId={o.id} couriers={couriers} shippingCompanies={shippingCompanies} />
                    ) : (
                      <span className="text-xs text-muted">تم التحديد</span>
                    )}
                  </td>
                )}
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
