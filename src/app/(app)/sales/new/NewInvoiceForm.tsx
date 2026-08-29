"use client";
import { useMemo, useState, useTransition } from "react";
import { createSalesInvoice } from "@/actions/sales";
import { createCustomer } from "@/actions/customers";
import { useRouter } from "next/navigation";

type Line = { productId: string; quantity: string; unitPrice: string; serials: string };

export default function NewInvoiceForm({ products, locations, customers, paymentMethods }: any) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "1", unitPrice: "", serials: "" }]);
  const [discount, setDiscount] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "UNPAID" | "PARTIAL">("PAID");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [source, setSource] = useState("OTHER");
  const [error, setError] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");

  const customer = customers.find((c: any) => c.id === customerId);
  const priceKey = customer?.type === "TRADER" ? "wholesalePrice" : "retailPrice";

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const total = subtotal - (parseFloat(discount) || 0);

  function setLine(idx: number, patch: Partial<Line>) {
    const next = [...lines];
    next[idx] = { ...next[idx], ...patch };
    setLines(next);
  }

  function selectProduct(idx: number, productId: string) {
    const p = products.find((p: any) => p.id === productId);
    setLine(idx, { productId, unitPrice: p ? p[priceKey] : "" });
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-bold">فاتورة بيع جديدة</h1>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow p-4 grid sm:grid-cols-3 gap-3">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); }} className="border rounded px-3 py-2 text-sm">
          <option value="">عميل نقدي (بدون تسجيل)</option>
          {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name} {c.type === "TRADER" ? "(تاجر)" : ""}</option>)}
        </select>
        <div className="flex gap-1">
          <input placeholder="أو عميل جديد بالاسم" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className="border rounded px-2 py-2 text-sm flex-1" />
          <button type="button" onClick={() => start(async () => {
            if (!newCustomerName) return;
            const c = await createCustomer({ name: newCustomerName, type: "RETAIL" });
            setCustomerId(c.id);
            setNewCustomerName("");
            router.refresh();
          })} className="bg-neutral-800 text-white rounded px-3 text-sm">إضافة</button>
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="border rounded px-3 py-2 text-sm">
          <option value="OTHER">مصدر: المحل</option>
          <option value="WEBSITE">الموقع</option>
          <option value="PHONE">تليفون</option>
          <option value="WHATSAPP">واتساب</option>
          <option value="FACEBOOK">فيسبوك</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-2">
        {lines.map((line, idx) => {
          const product = products.find((p: any) => p.id === line.productId);
          return (
            <div key={idx} className="grid sm:grid-cols-6 gap-2 items-center">
              <select value={line.productId} onChange={(e) => selectProduct(idx, e.target.value)} className="border rounded px-2 py-1.5 text-sm sm:col-span-2">
                <option value="">اختر منتج</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} (متاح: {p.totalStock})</option>)}
              </select>
              <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
              <input type="number" step="0.01" placeholder="السعر" value={line.unitPrice} onChange={(e) => setLine(idx, { unitPrice: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
              {product?.requiresSerial ? (
                <input placeholder="السيريال المباع" value={line.serials} onChange={(e) => setLine(idx, { serials: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
              ) : <div />}
              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-red-500 text-xs">حذف</button>
            </div>
          );
        })}
        <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "1", unitPrice: "", serials: "" }])} className="text-sm text-gold">+ إضافة سطر</button>
      </div>

      <div className="bg-white rounded-xl shadow p-4 grid sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-neutral-500">الخصم</label>
          <input type="number" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="border rounded px-3 py-2 text-sm w-full" />
        </div>
        <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)} className="border rounded px-3 py-2 text-sm">
          <option value="PAID">مدفوع بالكامل</option>
          <option value="PARTIAL">دفع جزئي</option>
          <option value="UNPAID">آجل بالكامل (تاجر)</option>
        </select>
        {paymentStatus !== "UNPAID" && (
          <>
            <input type="number" step="0.01" placeholder="المبلغ المدفوع الآن" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="border rounded px-3 py-2 text-sm" />
            <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-3 py-2 text-sm">
              {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </>
        )}
      </div>

      <div className="bg-neutral-900 text-white rounded-xl p-4 flex items-center justify-between">
        <div className="text-lg font-bold">الإجمالي: {total.toFixed(2)} ج.م</div>
        <button
          disabled={pending || !locationId}
          onClick={() =>
            start(async () => {
              setError("");
              try {
                const paid = paymentStatus === "PAID" ? total : paymentStatus === "PARTIAL" ? parseFloat(paidAmount) || 0 : 0;
                const inv = await createSalesInvoice({
                  customerId: customerId || undefined,
                  locationId,
                  items: lines.filter((l) => l.productId && l.quantity).map((l) => ({
                    productId: l.productId,
                    quantity: parseInt(l.quantity),
                    unitPrice: parseFloat(l.unitPrice) || 0,
                    serials: l.serials ? l.serials.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
                  })),
                  discount: parseFloat(discount) || 0,
                  paymentStatus,
                  paidAmount: paid,
                  paymentMethodId: paid > 0 ? paymentMethodId : undefined,
                  source: source as any,
                });
                router.push(`/sales/${inv.id}`);
              } catch (e: any) {
                setError(e.message || "حدث خطأ");
              }
            })
          }
          className="bg-gold hover:bg-gold-light rounded-lg px-6 py-3 font-bold"
        >
          حفظ وطباعة الفاتورة
        </button>
      </div>
    </div>
  );
}
