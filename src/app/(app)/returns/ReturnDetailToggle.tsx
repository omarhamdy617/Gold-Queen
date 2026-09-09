"use client";
import { useState } from "react";
import { getReturnDetail } from "@/actions/returns";
import { money } from "@/lib/format";

// كانت getReturnDetail() موجودة بالفعل في actions/returns.ts بس مش متربطة بأي شاشة خالص - مفيش أي
// مكان في الواجهة بيستدعيها. الكومبوننت ده بيوصلها بزرار "عرض الأصناف" في جدول المرتجعات، وبيحمّل
// التفاصيل مرة واحدة بس أول ما تتفتح (زي نفس فكرة loadedOnce المستخدمة في ConsignmentActivity).
export default function ReturnDetailToggle({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loadedOnce) {
      setLoading(true);
      const res: any = await getReturnDetail(id);
      setItems(res?.items || []);
      setLoadedOnce(true);
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={toggle} className="text-primary text-xs underline whitespace-nowrap">
        {open ? "إخفاء الأصناف ▲" : "عرض الأصناف ▾"}
      </button>
      {open && (
        <div className="mt-2 bg-neutral-50 border rounded p-2 text-xs space-y-1 min-w-[180px]">
          {loading && <div className="text-muted">بيحمّل...</div>}
          {!loading && items.length === 0 && <div className="text-muted">مفيش أصناف مسجلة</div>}
          {!loading &&
            items.map((it: any) => (
              <div key={it.id} className="flex justify-between gap-3">
                <span>{it.productName}</span>
                <span className="text-muted">{it.quantity} × {money(it.unitPrice)}</span>
              </div>
            ))}
        </div>
      )}
    </>
  );
}
