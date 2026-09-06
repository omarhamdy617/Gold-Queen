"use client";
import { useState, useTransition } from "react";
import { updateCustomer } from "@/actions/customers";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";
import { friendlyErrorMessage } from "@/lib/errors";

// قبل كده مفيش أي طريقة في الواجهة تعدّل بيانات عميل موجود (الاسم/الهاتف/حد الائتمان) - الكود اللي
// بيعمل التعديل كان موجود جاهز في الأكشن بس مش متوصل بحاجة في الشاشة.
export default function EditCustomerForm({ customer }: { customer: any }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [form, setForm] = useState({
    name: customer.name || "",
    phone: customer.phone || "",
    type: customer.type as "RETAIL" | "TRADER",
    creditLimit: String(customer.creditLimit ?? "0"),
    notes: customer.notes || "",
  });
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-primary underline">
        تعديل بيانات العميل
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <h2 className="font-bold text-sm">تعديل بيانات العميل</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <input placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-3 py-2 text-sm" />
        <input placeholder="رقم الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="border rounded px-3 py-2 text-sm" />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "RETAIL" | "TRADER" })} className="border rounded px-3 py-2 text-sm">
          <option value="RETAIL">فرد</option>
          <option value="TRADER">تاجر</option>
        </select>
        <input
          type="number"
          step="0.01"
          placeholder="حد الائتمان (0 = بلا حد، سالب = ممنوع دين خالص)"
          value={form.creditLimit}
          onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
          className="border rounded px-3 py-2 text-sm"
        />
        <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="border rounded px-3 py-2 text-sm sm:col-span-2" />
      </div>
      {error && <div className="text-red-600 text-xs">{error}</div>}
      <div className="flex gap-2">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("");
              try {
                const r = await updateCustomer(customer.id, {
                  name: form.name.trim(),
                  phone: form.phone.trim() || undefined,
                  type: form.type,
                  creditLimit: parseFloat(form.creditLimit) || 0,
                  notes: form.notes.trim() || undefined,
                });
                if (isActionError(r)) { setError(r.error); return; }
                setOpen(false);
                router.refresh();
              } catch (e: any) {
                setError(friendlyErrorMessage(e, "تعذر حفظ بيانات العميل"));
              }
            })
          }
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm"
        >
          حفظ
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
      </div>
    </div>
  );
}
