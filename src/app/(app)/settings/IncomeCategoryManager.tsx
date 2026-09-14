"use client";
import { useState, useTransition } from "react";
import { createIncomeCategory, deleteIncomeCategory } from "@/actions/income";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

// نفس ExpenseCategoryManager بالظبط (شوف التعليق هناك) بس لتصنيفات الإيرادات - إضافة تصنيف جديد
// وحذف تصنيف موجود، والحذف بيترفض تلقائيًا لو التصنيف مستخدم في أي إيراد مسجّل قبل كده.
export default function IncomeCategoryManager({ categories }: { categories: any[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const [addError, setAddError] = useState("");
  const [rowError, setRowError] = useState<Record<string, string>>({});

  function remove(c: any) {
    if (!confirm(`متأكد إنك عايز تمسح تصنيف "${c.name}"؟ لو مستخدم في أي إيراد مسجّل هيترفض الحذف تلقائيًا.`)) return;
    setRowError((prev) => ({ ...prev, [c.id]: "" }));
    start(async () => {
      try {
        const r = await deleteIncomeCategory(c.id);
        if (isActionError(r)) {
          setRowError((prev) => ({ ...prev, [c.id]: r.error }));
          return;
        }
        router.refresh();
      } catch (err: any) {
        setRowError((prev) => ({ ...prev, [c.id]: friendlyErrorMessage(err, "تعذر حذف التصنيف") }));
      }
    });
  }

  return (
    <div className="app-card p-4 space-y-3">
      <h2 className="font-bold">تصنيفات الإيرادات</h2>
      <ul className="text-sm space-y-2">
        {categories.map((c) => (
          <li key={c.id}>
            <div className="flex items-center justify-between gap-2">
              <span>• {c.name}</span>
              <button disabled={pending} type="button" onClick={() => remove(c)} className="text-red-600 underline text-xs">
                حذف
              </button>
            </div>
            {rowError[c.id] && <div className="text-red-600 text-xs mt-1">{rowError[c.id]}</div>}
          </li>
        ))}
        {categories.length === 0 && <li className="text-muted">مفيش تصنيفات لسه</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAddError("");
          start(async () => {
            if (!name.trim()) return;
            try {
              await createIncomeCategory(name.trim());
              setName("");
              router.refresh();
            } catch (err: any) {
              setAddError(friendlyErrorMessage(err, "تعذر إضافة التصنيف - الاسم لسه موجود، جرب تاني"));
            }
          });
        }}
        className="flex gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم تصنيف جديد" className="border rounded px-3 py-2 text-sm flex-1" />
        <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
      </form>
      {addError && <div className="text-red-600 text-xs">{addError}</div>}
    </div>
  );
}
