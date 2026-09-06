"use client";
import { useState, useTransition } from "react";
import { updateExpense, deleteExpense } from "@/actions/expenses";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

// قبل كده مفيش أي طريقة تعدّل أو تمسح مصروف اتسجل غلط - غير تسوية خزينة يدوية منفصلة عن المصروف نفسه.
export default function ExpenseRowActions({ expense, categories, paymentMethods }: { expense: any; categories: any[]; paymentMethods: any[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [form, setForm] = useState({
    categoryId: expense.categoryId,
    amount: String(expense.amount),
    paymentMethodId: expense.paymentMethodId,
    note: expense.note || "",
  });
  const [error, setError] = useState("");

  if (open) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 py-1">
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="border rounded px-2 py-1 text-xs">
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="number" step="0.01" min="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="border rounded px-2 py-1 text-xs w-24" />
        <select value={form.paymentMethodId} onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })} className="border rounded px-2 py-1 text-xs">
          {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="border rounded px-2 py-1 text-xs" placeholder="ملاحظة" />
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("");
              try {
                const r = await updateExpense(expense.id, { categoryId: form.categoryId, amount: parseFloat(form.amount), paymentMethodId: form.paymentMethodId, note: form.note });
                if (isActionError(r)) { setError(r.error); return; }
                setOpen(false);
                router.refresh();
              } catch (e: any) {
                setError(friendlyErrorMessage(e, "تعذر حفظ التعديل"));
              }
            })
          }
          className="bg-primary text-white text-xs rounded px-2 py-1"
        >
          حفظ
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutral-500">إلغاء</button>
        {error && <span className="text-red-600 text-xs w-full">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setOpen(true)} className="text-xs text-primary">تعديل</button>
      <button
        onClick={() => {
          if (!confirm("هتمسح المصروف ده؟ هيترجع المبلغ للخزينة تلقائيًا.")) return;
          start(async () => {
            const r = await deleteExpense(expense.id);
            if (isActionError(r)) { alert(r.error); return; }
            router.refresh();
          });
        }}
        className="text-xs text-red-600"
      >
        حذف
      </button>
    </div>
  );
}
