"use client";
import { useState, useTransition } from "react";
import { createCustomer } from "@/actions/customers";
import { useRouter } from "next/navigation";

export default function CustomerForm() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", phone: "", type: "RETAIL" as "RETAIL" | "TRADER", creditLimit: "" });
  const [error, setError] = useState("");

  if (!open) return <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ إضافة عميل/تاجر</button>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          try {
            await createCustomer({ name: form.name, phone: form.phone || undefined, type: form.type, creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined });
            setOpen(false);
            setForm({ name: "", phone: "", type: "RETAIL", creditLimit: "" });
            router.refresh();
          } catch (e: any) {
            setError(e?.message || "حصل خطأ أثناء إضافة العميل");
          }
        });
      }}
      className="bg-white rounded-xl shadow p-4 grid sm:grid-cols-4 gap-3"
    >
      {error && <div className="sm:col-span-4 text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <input required placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      <input placeholder="رقم الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className="border rounded px-3 py-2 text-sm">
        <option value="RETAIL">فرد (سعر تجزئة)</option>
        <option value="TRADER">تاجر (سعر جملة وآجل)</option>
      </select>
      {form.type === "TRADER" && (
        <input type="number" placeholder="حد الائتمان" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      )}
      <div className="flex gap-2 sm:col-span-4">
        <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">حفظ</button>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
      </div>
    </form>
  );
}
