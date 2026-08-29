"use client";
import { useState, useTransition } from "react";
import { createExpenseCategory } from "@/actions/expenses";
import { useRouter } from "next/navigation";

export default function ExpenseCategoryManager({ categories }: { categories: any[] }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
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
          start(async () => {
            if (!name.trim()) return;
            await createExpenseCategory(name.trim());
            setName("");
            router.refresh();
          });
        }}
        className="flex gap-2"
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم تصنيف جديد" className="border rounded px-3 py-2 text-sm flex-1" />
        <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">إضافة</button>
      </form>
    </div>
  );
}
