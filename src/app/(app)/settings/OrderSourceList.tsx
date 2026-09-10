"use client";
import { useState, useTransition } from "react";
import { updateOrderSource, deleteOrderSource } from "@/actions/orderSources";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

// عرض مصادر الأوردر مع إمكانية تعديل الاسم، وتعطيل/تفعيل، وحذف حقيقي لو مفيش أي فواتير/أوردرات
// مرتبطة بالمصدر ده قبل كده (الحماية الفعلية موجودة في deleteOrderSource نفسها في السيرفر) - نفس
// أسلوب LocationList بالظبط. قبل كده مصادر الأوردر كانت قيم enum ثابتة في قاعدة البيانات، مستخدمة
// في شاشتي فاتورة البيع والأوردر، من غير أي إمكانية تعديل أو إضافة مصدر جديد غير عن طريق كود.
export default function OrderSourceList({ sources }: { sources: any[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<Record<string, string>>({});
  const router = useRouter();

  function startEdit(s: any) {
    setEditingId(s.id);
    setName(s.name);
    setError({});
  }

  function saveEdit(id: string) {
    setError({});
    start(async () => {
      const r = await updateOrderSource(id, { name });
      if (isActionError(r)) { setError({ [id]: r.error }); return; }
      setEditingId(null);
      router.refresh();
    });
  }

  function toggleActive(s: any) {
    setError({});
    start(async () => {
      const r = await updateOrderSource(s.id, { active: !s.active });
      if (isActionError(r)) { setError({ [s.id]: r.error }); return; }
      router.refresh();
    });
  }

  function remove(s: any) {
    if (!confirm(`متأكد إنك عايز تمسح مصدر "${s.name}"؟ لو مرتبط بأي فواتير أو أوردرات هيترفض الحذف تلقائيًا.`)) return;
    setError({});
    start(async () => {
      try {
        const r = await deleteOrderSource(s.id);
        if (isActionError(r)) { setError({ [s.id]: r.error }); return; }
        router.refresh();
      } catch (e: any) {
        setError({ [s.id]: friendlyErrorMessage(e, "تعذر حذف المصدر") });
      }
    });
  }

  return (
    <ul className="text-sm space-y-2">
      {sources.map((s) => (
        <li key={s.id} className={`border rounded-lg p-2.5 ${!s.active ? "opacity-60 bg-neutral-50" : ""}`}>
          {editingId === s.id ? (
            <div className="flex flex-wrap gap-2 items-center">
              <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-2 py-1 text-sm flex-1 min-w-[120px]" />
              <button disabled={pending} onClick={() => saveEdit(s.id)} className="bg-primary text-white rounded px-3 py-1 text-xs">حفظ</button>
              <button type="button" onClick={() => setEditingId(null)} className="text-muted text-xs">إلغاء</button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>
                • {s.name} {!s.active && <span className="text-amber-700 text-xs">- معطّل</span>}
              </span>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => startEdit(s)} className="text-primary underline">تعديل</button>
                <button disabled={pending} type="button" onClick={() => toggleActive(s)} className="text-muted underline">
                  {s.active ? "تعطيل" : "تفعيل"}
                </button>
                <button disabled={pending} type="button" onClick={() => remove(s)} className="text-red-600 underline">حذف</button>
              </div>
            </div>
          )}
          {error[s.id] && <div className="text-red-600 text-xs mt-1">{error[s.id]}</div>}
        </li>
      ))}
      {sources.length === 0 && <li className="text-muted">مفيش مصادر أوردر مسجلة</li>}
    </ul>
  );
}
