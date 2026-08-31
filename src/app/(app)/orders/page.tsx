import { listOrders, listCouriers, listShippingCompanies, getOrderStats } from "@/actions/orders";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { can } from "@/lib/auth";
import { dateAr, money } from "@/lib/format";
import OrderForm from "./OrderForm";
import StatusControl from "./StatusControl";
import ShippingAssignForm from "./ShippingAssignForm";
import Link from "next/link";

export default async function OrdersPage() {
  const canShip = await can("orders.ship");
  const [orders, products, customers, couriers, shippingCompanies, locations, stats] = await Promise.all([
    listOrders(),
    listProductsWithStock(),
    listCustomers(),
    canShip ? listCouriers() : Promise.resolve([]),
    canShip ? listShippingCompanies() : Promise.resolve([]),
    listLocations(),
    getOrderStats(),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الأوردرات والشحن</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="إجمالي الأوردرات" value={stats.total} />
        <StatCard label="قيد التجهيز" value={stats.preparing} />
        <StatCard label="في الشحن" value={stats.shipped} />
        <StatCard label="تم التسليم" value={stats.delivered} />
        <StatCard label="مرتجع" value={stats.returned} />
        <StatCard label="تحصيل معلّق" value={stats.pendingCollection} highlight />
      </div>

      <OrderForm products={products} customers={customers} locations={locations} />
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
                <td className="p-3 font-mono text-xs">
                  <Link href={`/orders/${o.id}`} className="text-primary underline">{o.code}</Link>
                </td>
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

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="app-card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-bold ${highlight && value > 0 ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

function sourceLabel(s: string) { return { WEBSITE: "الموقع", PHONE: "تليفون", WHATSAPP: "واتساب", FACEBOOK: "فيسبوك", OTHER: "أخرى" }[s] || s; }
function shipLabel(s: string) { return { INTERNAL_COURIER: "مندوب داخلي", EXTERNAL_COMPANY: "شركة شحن", OTHER: "أخرى" }[s] || s; }
