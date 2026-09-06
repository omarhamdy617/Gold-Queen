import { listAuditLogs } from "@/actions/audit";
import { dateAr } from "@/lib/format";

export default async function AuditPage() {
  const logs = await listAuditLogs();
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">سجل التدقيق</h1>
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead><tr className="border-b text-neutral-500"><th className="p-3">المستخدم</th><th>الإجراء</th><th>نوع العملية</th><th>التاريخ</th><th>التفاصيل</th></tr></thead>
          <tbody>
            {logs.map((l) => {
              const details = formatChanges(l.before, l.after);
              return (
                <tr key={l.id} className="border-b last:border-0 align-top">
                  <td className="p-3">{l.userName || "النظام"}</td>
                  <td>{actionLabel(l.action)}</td>
                  <td className="text-neutral-500">{entityLabel(l.entityType)}</td>
                  <td>{dateAr(l.createdAt)}</td>
                  <td className="max-w-[420px]">
                    {details.length === 0 ? (
                      <span className="text-neutral-400 text-xs">-</span>
                    ) : (
                      <details>
                        <summary className="text-primary text-xs cursor-pointer select-none">تفاصيل ({details.length})</summary>
                        <ul className="mt-1 text-xs space-y-1">
                          {details.map((d, i) => (
                            <li key={i} className="text-neutral-600">
                              <span className="font-bold">{d.key}:</span>{" "}
                              {d.before !== undefined && (
                                <span className="text-red-600 line-through">{d.before}</span>
                              )}{" "}
                              {d.after !== undefined && <span className="text-green-700">{d.after}</span>}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function actionLabel(a: string) { return { CREATE: "إنشاء", UPDATE: "تعديل", DELETE: "حذف", APPROVE: "اعتماد", REJECT: "رفض", LOGIN: "تسجيل دخول", ADJUST: "تسوية" }[a] || a; }
function entityLabel(e: string) { return { SalesInvoice: "فاتورة بيع", Purchase: "شراء", Product: "منتج", Customer: "عميل", ReturnRequest: "مرتجع", Expense: "مصروف", CashDrawer: "خزينة", Order: "أوردر", StockTransfer: "تحويل مخزون", Consignment: "عهدة", User: "مستخدم" }[e] || e; }

// بيقارن قيم before/after (JSON المسجلة وقت العملية) ويطلع بس الحقول اللي فعلاً اتغيرت،
// عشان صفحة الأودت تبقى ليها قيمة حقيقية في التحقيق بدل ما تكون مجرد سطر "تم التعديل".
function formatChanges(before: unknown, after: unknown): { key: string; before?: string; after?: string }[] {
  const b = (before && typeof before === "object" ? (before as Record<string, unknown>) : null) || null;
  const a = (after && typeof after === "object" ? (after as Record<string, unknown>) : null) || null;
  if (!b && !a) return [];
  if (b && !a) {
    return Object.entries(b).map(([key, v]) => ({ key, before: stringify(v) }));
  }
  if (a && !b) {
    return Object.entries(a).map(([key, v]) => ({ key, after: stringify(v) }));
  }
  const keys = Array.from(new Set([...Object.keys(b!), ...Object.keys(a!)]));
  const out: { key: string; before?: string; after?: string }[] = [];
  for (const key of keys) {
    const bv = b![key];
    const av = a![key];
    if (stringify(bv) === stringify(av)) continue;
    out.push({ key, before: stringify(bv), after: stringify(av) });
  }
  return out;
}
function stringify(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
