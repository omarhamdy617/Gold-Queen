"use client";
import { useState, useTransition } from "react";
import { createLoanAccount } from "@/actions/loans";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";

export default function LoanForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!open) return <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ حساب سلفة جديد</button>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        if (!name.trim()) return setError("اسم الشخص مطلوب");
        start(async () => {
          try {
            const res = await createLoanAccount({ name: name.trim(), phone: phone.trim() || undefined, notes: notes.trim() || undefined });
            if (isActionError(res)) { setError(res.error); return; }
            setName(""); setPhone(""); setNotes(""); setOpen(false);
            router.refresh();
          } catch (e: any) {
            setError(friendlyErrorMessage(e, "تعذر إضافة الحساب"));
          }
        });
      }}
      className="app-card p-4 space-y-2 max-w-md"
    >
      <div className="font-bold text-sm">حساب سلفة جديد</div>
      {error && <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
      <input required placeholder="اسم الشخص" value={name} onChange={(e) => setName(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
      <input placeholder="رقم الهاتف (اختياري)" value={phone} onChange={(e) => setPhone(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
      <textarea placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="border rounded px-2 py-1.5 text-sm w-full" />
      <div className="flex gap-2">
        <button disabled={pending} className="bg-gold text-white rounded px-4 py-1.5 text-sm">{pending ? "جارٍ الحفظ..." : "حفظ"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted">إلغاء</button>
      </div>
    </form>
  );
}
