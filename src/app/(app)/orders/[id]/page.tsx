import { getOrder, getRevertPreviewStatus } from "@/actions/orders";
import { listProductsWithStock } from "@/actions/products";
import { money, dateAr } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import { can, isCallerAdmin } from "@/lib/auth";
import { ORDER_STATUS_LABELS as LABELS, ORDER_ATTEMPT_RESULT_LABELS } from "@/lib/orderStatus";
import PrintButton from "@/components/PrintButton";
import PrintHeader from "@/components/PrintHeader";
import OrderEditForm from "../OrderEditForm";
import RevertStatusButton from "../RevertStatusButton";

const COLORS: Record<string, string> = {
  PENDING: "badge-gray",
  CONFIRMED: "badge-blue",
  PREPARING: "badge-gray",
  SHIPPED: "badge-blue",
  DELIVERED: "badge-green",
  RETURNED: "badge-red",
  CANCELLED: "badge-red",
};
const SHIP: Record<string, string> = { INTERNAL_COURIER: "مندوب داخلي", EXTERNAL_COMPANY: "شركة شحن", OTHER: "أخرى" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [data, canManage, isAdmin] = await Promise.all([getOrder(id), can("orders.manage"), isCallerAdmin()]);
  if (!data) return notFound();
  // اسم مصدر الأوردر (sourceName) بقى بييجي جاهز من getOrder نفسها - مصادر الأوردر بقت جدول
  // حقيقي قابل للتعديل من الإعدادات بدل قيم enum ثابتة (نفس أسلوب locationName بالظبط)
  const { order, items, locationName, sourceName, createdByName, assignedByName, deliveredByName, confirmedByName, cancelledByName } = data;

  const canEditDetails = canManage && !["DELIVERED", "RETURNED", "CANCELLED"].includes(order.status);
  const [products, revertToStatus] = await Promise.all([
    canEditDetails ? listProductsWithStock() : Promise.resolve([]),
    isAdmin ? getRevertPreviewStatus(id) : Promise.resolve(null),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="no-print flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href="/orders" className="text-xs text-primary underline">← كل الأوردرات</Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="text-xl font-bold">أوردر {order.code}</h1>
            <span className={`badge ${COLORS[order.status]}`}>{LABELS[order.status]}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && revertToStatus && <RevertStatusButton orderId={id} previousStatusLabel={LABELS[revertToStatus] || revertToStatus} />}
          <PrintButton />
        </div>
      </div>

      {canEditDetails && <OrderEditForm orderId={id} products={products} order={order} items={items} />}

      <div className="app-card p-4 space-y-3 print:shadow-none">
        <PrintHeader subtitle={`تفاصيل أوردر - ${LABELS[order.status]}`} code={order.code} date={dateAr(order.createdAt)} />
        <h2 className="font-bold text-sm">بيانات العميل والتوصيل</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted">العميل: </span>{order.customerName}</div>
          <div><span className="text-muted">الهاتف: </span>{order.customerPhone}{order.customerPhone2 ? ` / ${order.customerPhone2}` : ""}</div>
          <div><span className="text-muted">العنوان: </span>{order.address}</div>
          <div><span className="text-muted">المحافظة: </span>{order.governorate}</div>
          <div><span className="text-muted">المصدر: </span>{sourceName}</div>
          <div><span className="text-muted">مدفوع مقدمًا: </span>{order.prepaid ? "نعم" : "لا"}</div>
          <div><span className="text-muted">هيتجهز من: </span>{locationName || "-"}</div>
          <div><span className="text-muted">التاريخ: </span>{dateAr(order.createdAt)}</div>
          {order.orderNotes && <div className="sm:col-span-2"><span className="text-muted">ملاحظات الأوردر: </span>{order.orderNotes}</div>}
          {order.deliveryNotes && <div className="sm:col-span-2"><span className="text-muted">ملاحظات التسليم: </span>{order.deliveryNotes}</div>}
        </div>
      </div>

      <div className="no-print app-card p-4 space-y-3">
        <h2 className="font-bold text-sm">مين عمل ايه</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted">سجّل الأوردر: </span>{createdByName || "-"}</div>
          {order.confirmedById && (
            <div><span className="text-muted">أكّده تليفونيًا: </span>{confirmedByName || "-"} {order.confirmedAt ? `- ${dateAr(order.confirmedAt)}` : ""}</div>
          )}
          {order.confirmationAttempts > 0 && (
            <div className="sm:col-span-2">
              <span className="text-muted">محاولات الاتصال قبل التأكيد: </span>{order.confirmationAttempts}
              {order.lastAttemptResult && <span> - آخر نتيجة: {ORDER_ATTEMPT_RESULT_LABELS[order.lastAttemptResult] || order.lastAttemptResult}{order.lastAttemptNote ? ` (${order.lastAttemptNote})` : ""}</span>}
            </div>
          )}
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
          {order.status === "CANCELLED" && (
            <div className="sm:col-span-2"><span className="text-muted">سبب الإلغاء: </span>{order.cancelReason || "-"} {cancelledByName ? `- بواسطة ${cancelledByName}` : ""} {order.cancelledAt ? `- ${dateAr(order.cancelledAt)}` : ""}</div>
          )}
        </div>
      </div>

      <div className="app-card p-4 space-y-3 print:shadow-none">
        <h2 className="font-bold text-sm">الأصناف والسعر</h2>
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-muted"><th className="py-2">المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b last:border-0">
                <td className="py-2">{it.productName}</td>
                <td>{it.quantity}</td>
                <td>{money(it.unitPrice)}</td>
                <td>{money(Number(it.unitPrice) * it.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t pt-3 space-y-1 text-sm max-w-xs mr-auto">
          <div className="flex justify-between"><span className="text-muted">إجمالي الأصناف</span><span>{money(order.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted">مصاريف الشحن</span><span>{money(order.shippingFee)}</span></div>
          <div className="flex justify-between"><span className="text-muted">الخصم</span><span>-{money(order.discount)}</span></div>
          <div className="flex justify-between font-bold text-primary border-t pt-1"><span>الإجمالي</span><span>{money(order.total)}</span></div>
        </div>
      </div>
    </div>
  );
}
