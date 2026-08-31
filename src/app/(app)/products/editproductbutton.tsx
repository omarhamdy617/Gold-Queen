"use client";
import { useState, useTransition } from "react";
import { updateProduct } from "@/actions/products";
import { useRouter } from "next/navigation";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EditProductButton({ product, categories }: { product: any; categories: any[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState<string>(product.imageUrl || "");
  const [form, setForm] = useState({
    name: product.name || "",
    categoryId: product.categoryId || "",
    requiresSerial: !!product.requiresSerial,
    warrantyMonths: product.warrantyMonths ? String(product.warrantyMonths) : "",
    wholesalePrice: String(product.wholesalePrice ?? ""),
    retailPrice: String(product.retailPrice ?? ""),
    reorderPoint: String(product.reorderPoint ?? "0"),
    active: product.active !== false,
  });

  function submit() {
    setError("");
    if (!form.name.trim()) return setError("اكتب اسم المنتج");
    const wholesale = parseFloat(form.wholesalePrice || "0");
    const retail = parseFloat(form.retailPrice || "0");
    if (!(wholesale >= 0) || !(retail >= 0)) return setError("أسعار غير صحيحة");
    start(async () => {
      try {
        await updateProduct(product.id, {
          name: form.name.trim(),
          categoryId: form.categoryId || undefined,
          requiresSerial: form.requiresSerial,
          warrantyMonths: form.warrantyMonths ? parseInt(form.warrantyMonths) : undefined,
          wholesalePrice: wholesale,
          retailPrice: retail,
          reorderPoint: parseInt(form.reorderPoint || "0"),
          active: form.active,
          imageUrl: imagePreview || undefined,
        });
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        setError(e?.message || "حصل خطأ أثناء حفظ التعديل");
      }
    });
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-primary underline">
        تعديل
      </button>
    );

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="app-card p-4 space-y-3 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold">تعديل: {product.name}</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-3 sm:col-span-2">
            <label className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-xs text-muted cursor-pointer overflow-hidden flex-shrink-0 bg-background">
              {imagePreview ? <img src={imagePreview} alt="" className="w-full h-full object-cover" /> : "صورة"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setImagePreview(await fileToDataUrl(file));
                }}
              />
            </label>
            {imagePreview && (
              <button type="button" onClick={() => setImagePreview("")} className="text-xs text-red-500">
                حذف الصورة
              </button>
            )}
          </div>
          <input placeholder="اسم المنتج" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="border rounded px-3 py-2 text-sm">
            <option value="">بدون تصنيف</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm border rounded px-3 py-2">
            <input type="checkbox" checked={form.requiresSerial} onChange={(e) => setForm({ ...form, requiresSerial: e.target.checked })} />
            يحتاج سيريال وضمان
          </label>
          {form.requiresSerial && (
            <input type="number" placeholder="مدة الضمان (شهور)" value={form.warrantyMonths} onChange={(e) => setForm({ ...form, warrantyMonths: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          )}
          <input type="number" step="0.01" placeholder="سعر الجملة" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          <input type="number" step="0.01" placeholder="سعر التجزئة" value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          <input type="number" placeholder="حد إعادة الطلب" value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm border rounded px-3 py-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            منتج فعّال (يظهر للبيع)
          </label>
        </div>
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
        <div className="flex gap-2">
          <button disabled={pending} onClick={submit} className="bg-primary text-white rounded-lg px-4 py-2 text-sm">حفظ التعديل</button>
          <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
        </div>
      </div>
    </div>
  );
}
