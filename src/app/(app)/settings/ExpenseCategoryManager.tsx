"use client";
import { useState, useTransition } from "react";
import { createExpenseCategory } from "@/actions/expenses";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";

export default function ExpenseCategoryManager({ categories }: { categories: any[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <div className="app-card p-4 space-y-3">
      <h2 className="font-bold">تصنيفات المصروفات</h2>
      <ul className="text-sm space-y-1">
        {categories.map((c) => <li key={c.id}>• {c.name}</li>)}
        {categories.length === 0 && <li className="text-muted">مفيش تصنيفات لسه</li>}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          start(async () => {
            if (!name.trim()) return;
            try {
              await createExpenseCategory(name.trim());
              setName("");
              router.refresh();
            } catch (err: any) {
              setError(friendlyErrorMessage(err, "تعذر إضافة التصنيف - الاسم لسه موجود، جرب تاني"));
            }
          });
        }}
        className="flex gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم تصنيف جديد" className="border rounded px-3 py-2 text-sm flex-1" />
        <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
      </form>
      {error && <div className="text-red-600 text-xs">{error}</div>}
    </div>
  );
}
