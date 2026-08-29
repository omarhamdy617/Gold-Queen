import { listAuditLogs } from "@/actions/audit";
import { dateAr } from "@/lib/format";

export default async function AuditPage() {
  const logs = await listAuditLogs();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">سجل التدقيق</h1>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-neutral-500"><th className="p-3">المستخدم</th><th>الإجراء</th><th>نوع العملية</th><th>التاريخ</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="p-3">{l.userName || "النظام"}</td>
                <td>{actionLabel(l.action)}</td>
                <td className="text-neutral-500">{entityLabel(l.entityType)}</td>
                <td>{dateAr(l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function actionLabel(a: string) { return { CREATE: "إنشاء", UPDATE: "تعديل", DELETE: "حذف", APPROVE: "اعتماد", REJECT: "رفض", LOGIN: "تسجيل دخول", ADJUST: "تسوية" }[a] || a; }
function entityLabel(e: string) { return { SalesInvoice: "فاتورة بيع", Purchase: "شراء", Product: "منتج", Customer: "عميل", ReturnRequest: "مرتجع", Expense: "مصروف", CashDrawer: "خزينة", Order: "أوردر", StockTransfer: "تحويل مخزون", Consignment: "عهدة", User: "مستخدم" }[e] || e; }
