"use client";
import { useEffect, useState, useTransition } from "react";
import { getConsignmentSalesLeaderboard } from "@/actions/consignments";
import { money, num } from "@/lib/format";
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

type Row = { holderId: string; holderName: string; count: number; total: number };

// ملخص مجمّع لمبيعات العهدة لكل المناديب مع بعض في شاشة واحدة - قبل كده الطريقة الوحيدة كانت تفتح
// عهدة كل موظف لوحدها (تاب "النشاط والمبيعات") وتجمع الأرقام يدويًا. هنا بيتعرضوا كلهم مرتبين
// (الأكتر مبيعًا فوق) لنفس الفترة المختارة.
export default function ConsignmentLeaderboard() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [loadedOnce, setLoadedOnce] = useState(false);

  function load() {
    setError("");
    start(async () => {
      try {
        const r = await getConsignmentSalesLeaderboard(new Date(from), new Date(to + "T23:59:59"));
        if (isActionError(r)) { setError(r.error); setRows(null); return; }
        setRows(r as Row[]);
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر تحميل ترتيب مبيعات العهدة"));
      }
    });
  }

  useEffect(() => {
    if (!loadedOnce) {
      setLoadedOnce(true);
      load();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grandTotal = rows?.reduce((s, r) => s + r.total, 0) || 0;

  return (
    <div className="app-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold">🏆 ترتيب مبيعات العهدة (كل المناديب)</h2>
      </div>
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

      {rows && rows.length === 0 && <div className="text-xs text-muted">مفيش أي بيع من عهدة موظفين في الفترة دي</div>}

      {rows && rows.length > 0 && (
        <div className="space-y-1.5">
          {rows.map((r, idx) => (
            <div key={r.holderId} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xs text-muted w-5 flex-shrink-0">{idx + 1}.</span>
                <span className="font-semibold truncate">{r.holderName}</span>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-xs text-muted">{num(r.count)} فاتورة</span>
                <span className="font-bold text-green-700">{money(r.total)}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm bg-gold/10 rounded-lg px-3 py-2 font-bold">
            <span>الإجمالي</span>
            <span className="text-green-700">{money(grandTotal)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
