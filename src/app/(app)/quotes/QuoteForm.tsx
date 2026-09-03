"use client";
import { useState, useTransition } from "react";
import { createQuote } from "@/actions/sales";
import { useRouter } from "next/navigation";
import SimpleCustomerField, { type SimpleCustomer, type SimpleCustomerValue } from "@/components/SimpleCustomerField";
import { friendlyErrorMessage } from "@/lib/errors";

export default function QuoteForm({ products, customers: initialCustomers, templates }: any) {
  const [customers] = useState<SimpleCustomer[]>(initialCustomers);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState("");
  const [customerField, setCustomerField] = useState<SimpleCustomerValue>({ customerId: "", name: "", phone: "", type: "RETAIL" });
  const customerId = customerField.customerId;
  const customerName = customerField.name;
  const customerPhone = customerField.phone;
  const [lines, setLines] = useState([{ productId: "", quantity: "1", unitPrice: "" }]);
  const [discountPct, setDiscountPct] = useState("");
  const [discountAmt, setDiscountAmt] = useState("");
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatRate, setVatRate] = useState("14");
  const [asTemplate, setAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");

  if (!open)
    return (
      <div className="flex gap-2">
        <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ عرض سعر جديد</button>
      </div>
    );

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  let afterDiscount = subtotal;
  if (discountPct) afterDiscount -= subtotal * (parseFloat(discountPct) / 100);
  if (discountAmt) afterDiscount -= parseFloat(discountAmt);
  const vat = vatEnabled ? afterDiscount * (parseFloat(vatRate || "0") / 100) : 0;
  const total = afterDiscount + vat;

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <SimpleCustomerField customers={customers} value={customerField} onChange={setCustomerField} />

      {lines.map((line, idx) => (
        <div key={idx} className="grid sm:grid-cols-4 gap-2">
          <select value={line.productId} onChange={(e) => {
            const p = products.find((p: any) => p.id === e.target.value);
            const next = [...lines]; next[idx] = { ...next[idx], productId: e.target.value, unitPrice: p?.retailPrice || "" }; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm sm:col-span-2">
            <option value="">اختر منتج</option>
            {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => {
            const next = [...lines]; next[idx].quantity = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm" />
          <input type="number" step="0.01" placeholder="السعر" value={line.unitPrice} onChange={(e) => {
            const next = [...lines]; next[idx].unitPrice = e.target.value; setLines(next);
          }} className="border rounded px-2 py-1.5 text-sm" />
        </div>
      ))}
      <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "1", unitPrice: "" }])} className="text-sm text-gold">+ سطر</button>

      <div className="grid sm:grid-cols-4 gap-3 border-t pt-3">
        <input type="number" placeholder="خصم %" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <input type="number" placeholder="خصم مبلغ" value={discountAmt} onChange={(e) => setDiscountAmt(e.target.value)} className="border rounded px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vatEnabled} onChange={(e) => setVatEnabled(e.target.checked)} /> إضافة ضريبة القيمة المضافة</label>
        {vatEnabled && <input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} className="border rounded px-3 py-2 text-sm" />}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} /> حفظ كإسطمبة/قالب
      </label>
      {asTemplate && <input placeholder="اسم القالب" value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="border rounded px-3 py-2 text-sm w-full" />}

      <div className="flex items-center justify-between border-t pt-3">
        <div className="font-bold">الإجمالي: {total.toFixed(2)} ج.م</div>
        <div className="flex gap-2">
          <button
            disabled={pending}
            onClick={() => start(async () => {
              setError("");
              try {
                const q = await createQuote({
                  customerId: customerId || undefined,
                  customerName: customerName || undefined,
                  customerPhone: customerPhone || undefined,
                  customerType: !customerId ? customerField.type : undefined,
                  items: lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity), unitPrice: parseFloat(l.unitPrice) || 0 })),
                  discountPct: discountPct ? parseFloat(discountPct) : undefined,
                  discountAmt: discountAmt ? parseFloat(discountAmt) : undefined,
                  vatEnabled,
                  vatRate: vatEnabled ? parseFloat(vatRate) : undefined,
                  isTemplate: asTemplate,
                  templateName: asTemplate ? templateName : undefined,
                });
                router.push(`/quotes/${q.id}`);
              } catch (e: any) {
                setError(friendlyErrorMessage(e, "تعذر حفظ عرض السعر"));
              }
            })}
            className="bg-gold text-white rounded-lg px-5 py-2 text-sm"
          >
            حفظ العرض
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
        </div>
        {error && <p className="text-red-600 text-sm bg-red-50 rounded-lg p-2">{error}</p>}
      </div>
    </div>
  );
}
