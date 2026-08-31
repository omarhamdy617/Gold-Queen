import { getOrder } from "@/actions/orders";
import { money, dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";

const LABELS: Record<string, string> = { PREPARING: "قيد التجهيز", SHIPPED: "في الشحن", DELIVERED: "تم التسليم", RETURNED: "مرتجع" };
const COLORS: Record<string, string> = { PREPARING: "badge-gray", SHIPPED: "badge-blue", DELIVERED: "badge-green", RETURNED: "badge-red" };
const SOURCE: Record<string, string> = { WEBSITE: "الموقع", PHONE: "تليفون", WHATSAPP: "واتساب", FACEBOOK: "فيسبوك", OTHER: "أخرى" };
const SHIP: Record<string, string> = { INTERNAL_COURIER: "مندوب داخلي", EXTERNAL_COMPANY: "شركة شحن", OTHER: "أخرى" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getOrder(id);
  if (!data) return notFound();
  const { order, items, locationName, createdByName, assignedByName, deliveredByName } = data;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/orders" className="text-xs text-primary underline">← كل الأوردرات</Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="text-xl font-bold">أوردر {order.code}</h1>
          <span className={`badge ${COLORS[order.status]}`}>{LABELS[order.status]}</span>
        </div>
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold text-sm">بيانات العميل والتوصيل</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted">العميل: </span>{order.customerName}</div>
          <div><span className="text-muted">الهاتف: </span>{order.customerPhone}{order.customerPhone2 ? ` / ${order.customerPhone2}` : ""}</div>
          <div><span className="text-muted">العنوان: </span>{order.address}</div>
          <div><span className="text-muted">المحافظة: </span>{order.governorate}</div>
          <div><span className="text-muted">المصدر: </span>{SOURCE[order.source] || order.source}</div>
          <div><span className="text-muted">مدفوع مقدمًا: </span>{order.prepaid ? "نعم" : "لا"}</div>
          <div><span className="text-muted">هيتجهز من: </span>{locationName || "-"}</div>
          <div><span className="text-muted">التاريخ: </span>{dateAr(order.createdAt)}</div>
          {order.orderNotes && <div className="sm:col-span-2"><span className="text-muted">ملاحظات الأوردر: </span>{order.orderNotes}</div>}
          {order.deliveryNotes && <div className="sm:col-span-2"><span className="text-muted">ملاحظات التسليم: </span>{order.deliveryNotes}</div>}
        </div>
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold text-sm">مين عمل ايه</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted">سجّل الأوردر: </span>{createdByName || "-"}</div>
          <div><span className="text-muted">حدد الشحن: </span>{assignedByName || "-"}</div>
          {order.shippingMethod && (
            <div><span className="text-muted">طريقة الشحن: </span>{SHIP[order.shippingMethod] || order.shippingMethod} {order.courierName || order.shippingCompanyName ? `- ${order.courierName || order.shippingCompanyName}` : ""}</div>
          )}
          {order.status === "DELIVERED" && (
            <>
              <div><span className="text-muted">سلّمه: </span>{deliveredByName || "-"}</div>
              <div><span className="text-muted">حالة التحصيل: </span>{order.collectionStatus === "COLLECTED" ? `تم التحصيل (${money(order.collectedAmount || 0)})` : "لسه ما اتحصلش"}</div>
            </>
          )}
          {order.status === "RETURNED" && (
            <div className="sm:col-span-2"><span className="text-muted">سبب الإرجاع: </span>{order.returnReason || "-"}</div>
          )}
        </div>
      </div>

      <div className="app-card p-4 space-y-3">
        <h2 className="font-bold text-sm">الأصناف</h2>
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-muted"><th className="py-2">المنتج</th><th>الكمية</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b last:border-0"><td className="py-2">{it.productName}</td><td>{it.quantity}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
