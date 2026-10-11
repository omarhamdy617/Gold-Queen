"use client";
import { useState, useTransition } from "react";
import { createExpense, createExpenseCategory } from "@/actions/expenses";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

export default function ExpenseForm({ categories, paymentMethods, orderSources }: any) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [newCategory, setNewCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [note, setNote] = useState("");
  const [adSourceId, setAdSourceId] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          try {
            let catId = categoryId;
            if (!catId && newCategory) {
              const c = await createExpenseCategory(newCategory);
              catId = c.id;
            }
            const r = await createExpense({ categoryId: catId, amount: parseFloat(amount), paymentMethodId, note, adSourceId: adSourceId || null });
            if (isActionError(r)) { setError(r.error); return; }
            setAmount(""); setNote(""); setNewCategory(""); setAdSourceId("");
            router.refresh();
          } catch (e: any) {
            setError(friendlyErrorMessage(e, "تعذر تسجيل المصروف"));
          }
        });
      }}
      className="bg-white rounded-xl shadow p-4 space-y-2"
    >
      <div className="grid sm:grid-cols-5 gap-3 items-end">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="">اختر تصنيف</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="أو تصنيف جديد" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <input required type="number" step="0.01" min="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input placeholder="بيان المصروف" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <select value={adSourceId} onChange={(e) => setAdSourceId(e.target.value)} className="border rounded px-3 py-2 text-sm sm:col-span-2" aria-label="قناة الإعلان">
          <option value="">مش إعلان (مصروف عادي)</option>
          {orderSources.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>إعلان على: {s.name}</option>)}
        </select>
        <p className="text-[11px] text-muted sm:col-span-3 self-center">لو المصروف ده إعلان، اختار القناة عشان يتحسب الـROAS وربح القناة في لوحة التحليلات (قسم التسويق).</p>
        <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm sm:col-span-5 sm:w-fit">تسجيل المصروف</button>
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
    </form>
  );
}
