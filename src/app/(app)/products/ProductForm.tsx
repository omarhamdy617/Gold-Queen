"use client";
import { useState, useTransition } from "react";
import { createProduct, createCategory } from "@/actions/products";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProductForm({ categories }: { categories: any[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [localCategories, setLocalCategories] = useState(categories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    categoryId: "",
    requiresSerial: false,
    warrantyMonths: "",
    wholesalePrice: "",
    retailPrice: "",
    minSellingPrice: "",
    reorderPoint: "0",
    barcode: "",
  });

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">
        + إضافة منتج جديد
      </button>
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          try {
            const r = await createProduct({
              name: form.name,
              categoryId: form.categoryId || undefined,
              requiresSerial: form.requiresSerial,
              warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths) : undefined,
              wholesalePrice: parseFloat(form.wholesalePrice || "0"),
              retailPrice: parseFloat(form.retailPrice || "0"),
              minSellingPrice: form.minSellingPrice.trim() ? parseFloat(form.minSellingPrice) : undefined,
              reorderPoint: parseInt(form.reorderPoint || "0"),
              barcode: form.barcode || undefined,
              imageUrl: imagePreview || undefined,
            });
            if (isActionError(r)) { setError(r.error); return; }
            setOpen(false);
            setForm({ name: "", categoryId: "", requiresSerial: false, warrantyMonths: "", wholesalePrice: "", retailPrice: "", minSellingPrice: "", reorderPoint: "0", barcode: "" });
            setImagePreview("");
            router.refresh();
          } catch (e: any) {
            setError(friendlyErrorMessage(e, "تعذر إضافة المنتج"));
          }
        });
      }}
      className="app-card p-4 space-y-3"
    >
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex items-center gap-3 md:col-span-1">
          <label className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-xs text-muted cursor-pointer overflow-hidden flex-shrink-0 bg-background">
            {imagePreview ? <img src={imagePreview} alt="" className="w-full h-full object-cover" /> : "صورة"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const dataUrl = await fileToDataUrl(file);
                setImagePreview(dataUrl);
              }}
            />
          </label>
          {imagePreview && (
            <button type="button" onClick={() => setImagePreview("")} className="text-xs text-red-500">
              حذف الصورة
            </button>
          )}
        </div>
        <input required placeholder="اسم المنتج" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2 text-sm" />
        <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="border rounded px-3 py-2 text-sm">
          <option value="">بدون تصنيف</option>
          {localCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex gap-1">
          <input placeholder="أو تصنيف جديد" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} className="border rounded px-2 py-2 text-sm flex-1" />
          <button
            type="button"
            onClick={() =>
              start(async () => {
                if (!newCategoryName.trim()) return;
                try {
                  const cat = await createCategory({ name: newCategoryName.trim(), requiresSerial: false });
                  if (isActionError(cat)) { setError(cat.error); return; }
                  setLocalCategories([...localCategories, cat]);
                  setForm({ ...form, categoryId: cat.id });
                  setNewCategoryName("");
                } catch (e: any) {
                  setError(friendlyErrorMessage(e, "تعذر إضافة الفئة"));
                }
              })
            }
            className="bg-navy text-white rounded px-3 text-sm"
          >
            إضافة
          </button>
        </div>
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
        <div>
          <input type="number" step="0.01" placeholder="أقل سعر بيع مسموح (اختياري)" value={form.minSellingPrice} onChange={(e) => setForm({ ...form, minSellingPrice: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" />
          <p className="text-[10px] text-muted mt-0.5">لو محدد، الموظفين (غير الأدمن) مش هيقدروا يبيعوا بسعر أقل منه في الفاتورة أو عرض السعر</p>
        </div>
        <input type="number" placeholder="حد إعادة الطلب" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} className="border rounded px-3 py-2 text-sm" />
      </div>
      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="flex gap-2">
        <button disabled={pending} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">حفظ</button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
      </div>
    </form>
  );
}
