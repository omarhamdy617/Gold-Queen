"use client";
import { useState, useTransition } from "react";
import { createExpense, createExpenseCategory } from "@/actions/expenses";
import { useRouter } from "next/navigation";

export default function ExpenseForm({ categories, paymentMethods }: any) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id || "");
  const [newCategory, setNewCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [note, setNote] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          let catId = categoryId;
          if (!catId && newCategory) {
            const c = await createExpenseCategory(newCategory);
            catId = c.id;
          }
          await createExpense({ categoryId: catId, amount: parseFloat(amount), paymentMethodId, note });
          setAmount(""); setNote(""); setNewCategory("");
          router.refresh();
        });
      }}
      className="bg-white rounded-xl shadow p-4 grid sm:grid-cols-5 gap-3 items-end"
    >
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="border rounded px-3 py-2 text-sm">
        <option value="">اختر تصنيف</option>
        {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <input placeholder="أو تصنيف جديد" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      <input required type="number" step="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-3 py-2 text-sm">
        {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <input placeholder="بيان المصروف" value={note} onChange={(e) => setNote(e.target.value)} className="border rounded px-3 py-2 text-sm" />
      <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm sm:col-span-5 sm:w-fit">تسجيل المصروف</button>
    </form>
  );
}
