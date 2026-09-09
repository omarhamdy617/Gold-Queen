"use client";
import { useState, useTransition } from "react";
import { updateLocation, deleteLocation } from "@/actions/products";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

const TYPE_LABEL: Record<string, string> = { SHOP: "محل", WAREHOUSE: "مخزن", OTHER: "أخرى" };

// عرض الفروع/الأماكن مع إمكانية تعديل الاسم/النوع، وتعطيل/تفعيل، وحذف حقيقي لو مفيش أي بيانات
// مرتبطة بالمكان ده (الحماية الفعلية موجودة في deleteLocation نفسها في السيرفر). قبل كده الشاشة
// كانت بس بتعرض لستة ثابتة (bullet list) من غير أي إمكانية تعديل أو حذف خالص.
export default function LocationList({ locations }: { locations: any[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<"SHOP" | "WAREHOUSE" | "OTHER">("SHOP");
  const [pending, start] = useTransition();
  const [error, setError] = useState<Record<string, string>>({});
  const router = useRouter();

  function startEdit(l: any) {
    setEditingId(l.id);
    setName(l.name);
    setType(l.type);
    setError({});
  }

  function saveEdit(id: string) {
    setError({});
    start(async () => {
      const r = await updateLocation(id, { name, type });
      if (isActionError(r)) { setError({ [id]: r.error }); return; }
      setEditingId(null);
      router.refresh();
    });
  }

  function toggleActive(l: any) {
    setError({});
    start(async () => {
      const r = await updateLocation(l.id, { active: !l.active });
      if (isActionError(r)) { setError({ [l.id]: r.error }); return; }
      router.refresh();
    });
  }

  function remove(l: any) {
    if (!confirm(`متأكد إنك عايز تمسح "${l.name}"؟ لو مرتبط بأي فواتير أو مخزون هيترفض الحذف تلقائيًا.`)) return;
    setError({});
    start(async () => {
      try {
        const r = await deleteLocation(l.id);
        if (isActionError(r)) { setError({ [l.id]: r.error }); return; }
        router.refresh();
      } catch (e: any) {
        setError({ [l.id]: friendlyErrorMessage(e, "تعذر حذف المكان") });
      }
    });
  }

  return (
    <ul className="text-sm space-y-2">
      {locations.map((l) => (
        <li key={l.id} className={`border rounded-lg p-2.5 ${!l.active ? "opacity-60 bg-neutral-50" : ""}`}>
          {editingId === l.id ? (
            <div className="flex flex-wrap gap-2 items-center">
              <input value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-2 py-1 text-sm flex-1 min-w-[120px]" />
              <select value={type} onChange={(e) => setType(e.target.value as any)} className="border rounded px-2 py-1 text-sm">
                <option value="SHOP">محل</option>
                <option value="WAREHOUSE">مخزن</option>
                <option value="OTHER">أخرى</option>
              </select>
              <button disabled={pending} onClick={() => saveEdit(l.id)} className="bg-primary text-white rounded px-3 py-1 text-xs">حفظ</button>
              <button type="button" onClick={() => setEditingId(null)} className="text-muted text-xs">إلغاء</button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span>
                • {l.name} ({TYPE_LABEL[l.type] || l.type}) {!l.active && <span className="text-amber-700 text-xs">- معطّل</span>}
              </span>
              <div className="flex gap-2 text-xs">
                <button type="button" onClick={() => startEdit(l)} className="text-primary underline">تعديل</button>
                <button disabled={pending} type="button" onClick={() => toggleActive(l)} className="text-muted underline">
                  {l.active ? "تعطيل" : "تفعيل"}
                </button>
                <button disabled={pending} type="button" onClick={() => remove(l)} className="text-red-600 underline">حذف</button>
              </div>
            </div>
          )}
          {error[l.id] && <div className="text-red-600 text-xs mt-1">{error[l.id]}</div>}
        </li>
      ))}
      {locations.length === 0 && <li className="text-muted">مفيش أماكن مسجلة</li>}
    </ul>
  );
}
