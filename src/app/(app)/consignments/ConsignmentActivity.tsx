"use client";
import { useState, useTransition } from "react";
import { getConsignmentActivity } from "@/actions/consignments";
import { money } from "@/lib/format";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

type ActivityInvoice = { id: string; code: string; total: string; createdAt: string; customerName: string | null };

export default function ConsignmentActivity({ holderId }: { holderId: string }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<{ count: number; total: number; invoices: ActivityInvoice[] } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function load() {
    setError("");
    start(async () => {
      try {
        const r = await getConsignmentActivity(holderId, new Date(from), new Date(to + "T23:59:59"));
        if (isActionError(r)) { setError(r.error); setData(null); return; }
        setData(r as any);
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تحميل نشاط الموظف"));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); load(); }}
        className="text-xs text-navy underline"
      >
        📊 النشاط والمبيعات
      </button>
    );
  }

  return (
    <div className="border-t pt-3 mt-2 space-y-2">
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">إخفاء النشاط ✕</button>
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <label className="text-[10px] text-muted block mb-0.5">من</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-xs" />
        </div>
        <div>
          <label className="text-[10px] text-muted block mb-0.5">إلى</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-xs" />
        </div>
        <button disabled={pending} onClick={load} className="bg-navy text-white text-xs rounded px-3 py-1.5">
          {pending ? "جارٍ التحميل..." : "تحديث"}
        </button>
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
      {data && (
        <>
          <div className="flex gap-4 bg-neutral-50 rounded-lg px-3 py-2">
            <div className="text-xs">
              <span className="text-muted">عدد الفواتير: </span>
              <span className="font-bold">{data.count}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted">إجمالي المبيعات: </span>
              <span className="font-bold text-green-700">{money(data.total)}</span>
            </div>
          </div>
          {data.invoices.length > 0 ? (
            <table className="w-full text-[11px] text-right">
              <thead className="text-muted border-b">
                <tr><th className="py-1">الفاتورة</th><th>العميل</th><th>التاريخ</th><th>المبلغ</th></tr>
              </thead>
              <tbody>
                {data.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b last:border-0">
                    <td className="py-1">{inv.code}</td>
                    <td>{inv.customerName || "-"}</td>
                    <td>{new Date(inv.createdAt).toLocaleDateString("ar-EG")}</td>
                    <td>{money(inv.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-xs text-muted">مفيش فواتير بيع من العهدة في الفترة دي</div>
          )}
        </>
      )}
    </div>
  );
}
