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
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "UNPAID" | "PARTIAL">("PAID");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [source, setSource] = useState("OTHER");
  const [error, setError] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const customer = customers.find((c: any) => c.id === customerId);
  const priceKey = customer?.type === "TRADER" ? "wholesalePrice" : "retailPrice";

  const validLines = lines.filter((l) => l.productId && parseFloat(l.quantity) > 0);
  const subtotal = validLines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const discount = discountType === "percent" ? (subtotal * (parseFloat(discountValue) || 0)) / 100 : parseFloat(discountValue) || 0;
  const total = Math.max(subtotal - discount, 0);

  function setLine(idx: number, patch: Partial<Line>) {
    const next = [...lines];
    next[idx] = { ...next[idx], ...patch };
    setLines(next);
  }

  function selectProduct(idx: number, productId: string) {
    const p = products.find((p: any) => p.id === productId);
    setLine(idx, { productId, unitPrice: p ? p[priceKey] : "" });
  }

  async function submit() {
    setError("");
    if (validLines.length === 0) {
      setError("لازم تضيف صنف واحد على الأقل بكمية أكبر من صفر قبل الحفظ");
      return;
    }
    if (!locationId) {
      setError("اختار المحل أو المخزن اللي هيتباع منه");
      return;
    }
    start(async () => {
      try {
        const paid = paymentStatus === "PAID" ? total : paymentStatus === "PARTIAL" ? parseFloat(paidAmount) || 0 : 0;
        const inv = await createSalesInvoice({
          customerId: customerId || undefined,
          locationId,
          items: validLines.map((l) => ({
            productId: l.productId,
            quantity: parseInt(l.quantity),
            unitPrice: parseFloat(l.unitPrice) || 0,
            serials: l.serials ? l.serials.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          })),
          discount,
          paymentStatus,
          paidAmount: paid,
          paymentMethodId: paid > 0 ? paymentMethodId : undefined,
          source: source as any,
        });
        router.push(`/sales/${inv.id}`);
      } catch (e: any) {
        setError(e.message || "حدث خطأ");
      }
    });
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-bold">فاتورة بيع جديدة</h1>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      <div className="app-card p-4 space-y-3">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide">بيانات الفاتورة</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted mb-1 block">المكان اللي هيتباع منه *</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border rounded px-3 py-2 text-sm w-full">
              {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">مصدر البيع</label>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="border rounded px-3 py-2 text-sm w-full">
              <option value="OTHER">المحل</option>
              <option value="WEBSITE">الموقع</option>
              <option value="PHONE">تليفون</option>
              <option value="WHATSAPP">واتساب</option>
              <option value="FACEBOOK">فيسبوك</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-muted mb-1 block">العميل (اختياري)</label>
          <div className="grid sm:grid-cols-3 gap-2">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="border rounded px-3 py-2 text-sm">
              <option value="">عميل نقدي (بدون تسجيل)</option>
              {customers.map((c: any) => <option key={c.id} value={c.id}>{c.name} {c.type === "TRADER" ? "(تاجر)" : ""}</option>)}
            </select>
            <input placeholder="اسم عميل جديد" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className="border rounded px-2 py-2 text-sm" />
            <div className="flex gap-1">
              <input placeholder="رقم الهاتف (اختياري)" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} className="border rounded px-2 py-2 text-sm flex-1" />
              <button
                type="button"
                onClick={() =>
                  start(async () => {
                    if (!newCustomerName) return;
                    const c = await createCustomer({ name: newCustomerName, phone: newCustomerPhone || undefined, type: "RETAIL" });
                    setCustomerId(c.id);
                    setNewCustomerName("");
                    setNewCustomerPhone("");
                    router.refresh();
                  })
                }
                className="bg-navy text-white rounded px-3 text-sm"
              >
                إضافة
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="app-card p-4 space-y-2">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">الأصناف</div>
        <div className="hidden sm:grid sm:grid-cols-7 gap-2 text-xs text-muted px-1">
          <div className="sm:col-span-2">المنتج</div>
          <div>الكمية</div>
          <div>السعر</div>
          <div>سيريال</div>
          <div>الإجمالي</div>
          <div></div>
        </div>
        {lines.map((line, idx) => {
          const product = products.find((p: any) => p.id === line.productId);
          const lineTotal = (parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0);
          return (
            <div key={idx} className="grid sm:grid-cols-7 gap-2 items-center">
              <select value={line.productId} onChange={(e) => selectProduct(idx, e.target.value)} className="border rounded px-2 py-1.5 text-sm sm:col-span-2">
                <option value="">اختر منتج</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name} (متاح: {p.totalStock})</option>)}
              </select>
              <input type="number" min="1" placeholder="الكمية" value={line.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
              <input type="number" step="0.01" placeholder="السعر" value={line.unitPrice} onChange={(e) => setLine(idx, { unitPrice: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
              {product?.requiresSerial ? (
                <input placeholder="السيريال المباع" value={line.serials} onChange={(e) => setLine(idx, { serials: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
              ) : <div className="hidden sm:block" />}
              <div className="text-sm font-medium">{lineTotal ? lineTotal.toFixed(2) : ""}</div>
              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-red-500 text-xs justify-self-start">حذف</button>
            </div>
          );
        })}
        <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "1", unitPrice: "", serials: "" }])} className="text-sm text-primary">+ إضافة سطر</button>
      </div>

      <div className="app-card p-4 space-y-3">
        <div className="text-xs font-semibold text-muted uppercase tracking-wide">الخصم والدفع</div>
        <div className="grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-xs text-muted mb-1 block">نوع الخصم</label>
            <div className="flex gap-2">
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)} className="border rounded px-2 py-2 text-sm">
                <option value="amount">مبلغ (ج.م)</option>
                <option value="percent">نسبة (%)</option>
              </select>
              <input type="number" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className="border rounded px-3 py-2 text-sm w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted mb-1 block">حالة السداد</label>
            <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)} className="border rounded px-3 py-2 text-sm w-full">
              <option value="PAID">مدفوع بالكامل</option>
              <option value="PARTIAL">دفع جزئي</option>
              <option value="UNPAID">آجل بالكامل (تاجر)</option>
            </select>
          </div>
          {paymentStatus !== "UNPAID" && (
            <>
              <div>
                <label className="text-xs text-muted mb-1 block">{paymentStatus === "PARTIAL" ? "المبلغ المدفوع الآن" : "المبلغ"}</label>
                <input type="number" step="0.01" placeholder={total.toFixed(2)} value={paymentStatus === "PARTIAL" ? paidAmount : total.toFixed(2)} disabled={paymentStatus === "PAID"} onChange={(e) => setPaidAmount(e.target.value)} className="border rounded px-3 py-2 text-sm w-full disabled:bg-background" />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">طريقة الدفع</label>
                <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-3 py-2 text-sm w-full">
                  {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="text-sm text-muted flex justify-between border-t border-border pt-2">
          <span>الإجمالي الفرعي: {subtotal.toFixed(2)} ج.م</span>
          <span>الخصم: {discount.toFixed(2)} ج.م</span>
        </div>
      </div>

      <div className="bg-navy text-white rounded-xl p-4 flex items-center justify-between sticky bottom-4 shadow-lg">
        <div className="text-lg font-bold">الإجمالي: {total.toFixed(2)} ج.م</div>
        <button
          disabled={pending}
          onClick={submit}
          className="bg-primary hover:bg-primary-dark rounded-lg px-6 py-3 font-bold disabled:opacity-60"
        >
          {pending ? "جارٍ الحفظ..." : "حفظ وطباعة الفاتورة"}
        </button>
      </div>
    </div>
  );
}
