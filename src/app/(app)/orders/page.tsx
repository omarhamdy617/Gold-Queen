import { listOrders, listCouriers, listShippingCompanies, getOrderStats } from "@/actions/orders";
import { listProductsWithStock, listLocations } from "@/actions/products";
import { listCustomers } from "@/actions/customers";
import { listPaymentMethods } from "@/actions/cash";
import { can } from "@/lib/auth";
import { dateAr, money } from "@/lib/format";
import { ORDER_STATUS_LABELS } from "@/lib/orderStatus";
import OrderForm from "./OrderForm";
import StatusControl from "./StatusControl";
import ShippingAssignForm from "./ShippingAssignForm";
import AssignLocationForm from "./AssignLocationForm";
import OrderSearchBox from "./OrderSearchBox";
import Link from "next/link";

// رفعنا المهلة القصوى لتنفيذ الصفحة دي على السيرفر (Vercel) - كانت الصفحة أحيانًا بتاخد وقت طويل
// (كل الاستعلامات التقيلة اللي بتحصل مرة واحدة: منتجات ومخزون كامل، عملاء، إحصائيات...) وتصطدم
// بالمهلة الافتراضية (10 ثانية) فتظهر "network error" - ده أمان إضافي فوق تحسين الاستعلامات نفسها.
// رفعناها لـ 60 (كانت 30) بعد ما ظهر إيرور "504 GATEWAY_TIMEOUT / FUNCTION_INVOCATION_TIMEOUT" -
// يعني الصفحة كانت فعلًا شغالة وهتخلص، بس ضربت الـ 30 ثانية اللي كنا حاطينها وانقفلت بالقوة قبل
// ما تخلص. الرقم 60 لسه أقل بكتير من حد Vercel الأقصى (300 ثانية على خطة Hobby)، فمعندناش خسارة
// لو محتاجينه أعلى من كده بعدين.
export const maxDuration = 60;

const STAT_ORDER: { key: string; statKey: string }[] = [
  { key: "ALL", statKey: "total" },
  { key: "PENDING", statKey: "pending" },
  { key: "CONFIRMED", statKey: "confirmed" },
  { key: "PREPARING", statKey: "preparing" },
  { key: "SHIPPED", statKey: "shipped" },
  { key: "DELIVERED", statKey: "delivered" },
  { key: "RETURNED", statKey: "returned" },
  { key: "CANCELLED", statKey: "cancelled" },
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const { status: rawStatus, q, page: rawPage } = await searchParams;
  const status = rawStatus && rawStatus !== "ALL" ? rawStatus : "ALL";
  const pageNum = Math.max(1, parseInt(rawPage || "1") || 1);
  const [canShip, canConfirmPerm] = await Promise.all([can("orders.ship"), can("orders.confirm")]);
  const canConfirm = canShip || canConfirmPerm;
  const [{ rows: orders, hasMore }, products, customers, couriers, shippingCompanies, locations, stats, paymentMethods] = await Promise.all([
    listOrders(status, q, pageNum),
    listProductsWithStock(),
    listCustomers(),
    canShip ? listCouriers() : Promise.resolve([]),
    canShip ? listShippingCompanies() : Promise.resolve([]),
    listLocations(),
    getOrderStats(),
    listPaymentMethods(),
  ]);
  const canManageStatus = canShip || canConfirm;

  const qsFor = (st: string, p: number = 1) => {
    const params = new URLSearchParams();
    if (st !== "ALL") params.set("status", st);
    if (q?.trim()) params.set("q", q.trim());
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/orders?${qs}` : "/orders";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">الأوردرات والشحن</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {STAT_ORDER.map(({ key, statKey }) => (
          <Link key={key} href={qsFor(key)}>
            <StatCard label={key === "ALL" ? "إجمالي الأوردرات" : ORDER_STATUS_LABELS[key]} value={(stats as any)[statKey]} active={status === key} />
          </Link>
        ))}
        <StatCard label="تحصيل معلّق" value={stats.pendingCollection} highlight />
      </div>

      <OrderForm products={products} customers={customers} locations={locations} />

      <OrderSearchBox initialQuery={q || ""} status={status} />

      <div className="app-card overflow-x-auto">
        <table className="w-full text-sm text-right min-w-[1250px]">
          <thead>
            <tr className="border-b text-muted">
              <th className="p-3">الكود</th><th>العميل</th><th>الهاتف</th><th>العنوان</th><th>المحافظة</th><th>المصدر</th><th>الشحن</th><th>الإجمالي</th><th>الحالة</th><th>التاريخ</th>
              {canManageStatus && <th>المكان / الشحن</th>}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b last:border-0 align-top">
                <td className="p-3 font-mono text-xs">
                  <Link href={`/orders/${o.id}`} prefetch={false} className="text-primary underline">{o.code}</Link>
                </td>
                <td>{o.customerName || "-"}</td>
                <td className="text-xs">{o.customerPhone}{o.customerPhone2 ? ` / ${o.customerPhone2}` : ""}</td>
                <td className="text-xs max-w-[160px]">{o.address}{o.deliveryNotes ? <div className="text-muted">ملاحظات: {o.deliveryNotes}</div> : null}</td>
                <td className="text-xs">{o.governorate}</td>
                <td>{sourceLabel(o.source)}</td>
                <td className="text-xs">{o.shippingMethod ? `${shipLabel(o.shippingMethod)} - ${o.courierName || o.shippingCompanyName || ""}` : "-"}</td>
                <td className="font-semibold">{money(o.total)}</td>
                <td><StatusControl orderId={o.id} status={o.status} canEdit={canShip} canConfirm={canConfirm} paymentMethods={paymentMethods} confirmationAttempts={o.confirmationAttempts} /></td>
                <td className="text-xs">{dateAr(o.createdAt)}</td>
                {canManageStatus && (
                  <td className="p-2">
                    {o.status === "PENDING" ? (
                      <span className="text-xs text-muted">محتاج تأكيد الأول</span>
                    ) : o.status === "CONFIRMED" && !o.locationId ? (
                      canShip ? <AssignLocationForm orderId={o.id} locations={locations} /> : <span className="text-xs text-muted">محتاج تحديد مكان</span>
                    ) : o.locationId && !o.shippingMethod && !["DELIVERED", "RETURNED", "CANCELLED"].includes(o.status) ? (
                      canShip ? <ShippingAssignForm orderId={o.id} couriers={couriers} shippingCompanies={shippingCompanies} /> : <span className="text-xs text-muted">محتاج تحديد شحن</span>
                    ) : o.shippingMethod ? (
                      <span className="text-xs text-muted">تم التحديد</span>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {orders.length === 0 && (
              <tr><td colSpan={11} className="p-4 text-center text-muted">لا توجد أوردرات مطابقة</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(pageNum > 1 || hasMore) && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {pageNum > 1 ? (
            <Link href={qsFor(status, pageNum - 1)} className="bg-white border rounded-lg px-4 py-2 hover:bg-neutral-50">السابق</Link>
          ) : (
            <span className="border rounded-lg px-4 py-2 text-muted opacity-50">السابق</span>
          )}
          <span className="text-muted text-xs">صفحة {pageNum}</span>
          {hasMore ? (
            <Link href={qsFor(status, pageNum + 1)} className="bg-white border rounded-lg px-4 py-2 hover:bg-neutral-50">التالي</Link>
          ) : (
            <span className="border rounded-lg px-4 py-2 text-muted opacity-50">التالي</span>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight, active }: { label: string; value: number; highlight?: boolean; active?: boolean }) {
  return (
    <div className={`app-card p-3 cursor-pointer transition ${active ? "ring-2 ring-primary" : "hover:shadow-md"}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-bold ${highlight && value > 0 ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}

function sourceLabel(s: string) { return { WEBSITE: "الموقع", PHONE: "تليفون", WHATSAPP: "واتساب", FACEBOOK: "فيسبوك", OTHER: "أخرى" }[s] || s; }
function shipLabel(s: string) { return { INTERNAL_COURIER: "مندوب داخلي", EXTERNAL_COMPANY: "شركة شحن", OTHER: "أخرى" }[s] || s; }
