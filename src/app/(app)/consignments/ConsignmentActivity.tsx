"use client";
import { useEffect, useState, useTransition } from "react";
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

// الشاشة دي بقت بتتحكم فيها ConsignmentPanels (نفس فكرة ConsignmentDetail بالظبط) - مبقتش بتفتح
// نفسها بزرار خاص بيها عشان تبقى تاب جنب "📦 البضاعة" مش بند تحت منفصل.
export default function ConsignmentActivity({ holderId, open }: { holderId: string; open: boolean }) {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<{ count: number; total: number; invoices: ActivityInvoice[] } | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [loadedOnce, setLoadedOnce] = useState(false);

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

  useEffect(() => {
    if (open && !loadedOnce) {
      setLoadedOnce(true);
      load();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-end gap-2 flex-wrap bg-neutral-50 border rounded-lg p-2.5">
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
          <div className="flex gap-4 bg-gold/10 rounded-lg px-3 py-2">
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
            <div className="space-y-1.5">
              {data.invoices.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between text-xs border rounded-lg px-2.5 py-1.5">
                  <div>
                    <div className="font-semibold">{inv.code}</div>
                    <div className="text-[11px] text-muted">{inv.customerName || "بدون اسم عميل"} · {new Date(inv.createdAt).toLocaleDateString("ar-EG")}</div>
                  </div>
                  <div className="font-bold text-green-700">{money(inv.total)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted">مفيش فواتير بيع من العهدة في الفترة دي</div>
          )}
        </>
      )}
    </div>
  );
}
