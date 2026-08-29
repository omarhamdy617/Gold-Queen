"use client";
import { useState, useTransition } from "react";
import { createProduct } from "@/actions/products";

export default function ProductForm({ categories }: { categories: any[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    requiresSerial: false,
    warrantyMonths: "",
    wholesalePrice: "",
    retailPrice: "",
    reorderPoint: "0",
    barcode: "",
  });

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">
        + إضافة منتج جديد
      </button>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await createProduct({
            name: form.name,
            categoryId: form.categoryId || undefined,
            requiresSerial: form.requiresSerial,
            warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths) : undefined,
            wholesalePrice: parseFloat(form.wholesalePrice || "0"),
            retailPrice: parseFloat(form.retailPrice || "0"),
            reorderPoint: parseInt(form.reorderPoint || "0"),
            barcode: form.barcode || undefined,
          });
          setOpen(false);
          setForm({ name: "", categoryId: "", requiresSerial: false, warrantyMonths: "", wholesalePrice: "", retailPrice: "", reorderPoint: "0", barcode: "" });
        });
      }}
      className="bg-white rounded-xl shadow p-4 grid sm:grid-cols-2 md:grid-cols-4 gap-3"
    >
      <input required placeholder="اسم المنتج" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="border rounded px-3 py-2 text-sm">
        <option value="">بدون تصنيف</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input placeholder="باركود (اختياري)" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      <label className="flex items-center gap-2 text-sm border rounded px-3 py-2">
        <input type="checkbox" checked={form.requiresSerial} onChange={(e) => setForm({ ...form, requiresSerial: e.target.checked })} />
        يحتاج سيريال وضمان
      </label>
      {form.requiresSerial && (
        <input type="number" placeholder="مدة الضمان (شهور)" value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      )}
      <input required type="number" step="0.01" placeholder="سعر الجملة" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      <input required type="number" step="0.01" placeholder="سعر التجزئة" value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      <input type="number" placeholder="حد إعادة الطلب" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      <div className="flex gap-2 sm:col-span-2 md:col-span-4">
        <button disabled={pending} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">حفظ</button>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
      </div>
    </form>
  );
}
