"use client";
import { useState, useTransition, useEffect } from "react";
import { createReturnRequest, listCustomerInvoicesForReturn, getInvoiceItemsForReturn } from "@/actions/returns";
import { useRouter } from "next/navigation";
import CustomerPicker from "@/components/CustomerPicker";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";
import { money, dateAr } from "@/lib/format";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// سطر مرتجع بيع لازم يكون مرتبط ببند فاتورة حقيقي (invoiceItemId) - عشان حماية "منع تكرار الإرجاع
// لنفس البند بكمية أكبر من الأصلية" تفضل شغالة فعليًا (كانت موجودة بالسيرفر لكن معطّلة عمليًا لأن
// الشاشة القديمة كانت بتسمح تختار أي منتج/كمية حرة من غير ربط بفاتورة أصلًا).
type SaleLine = { invoiceItemId: string; productId: string; productName: string; unitPrice: number; returnableQty: number; quantity: string };
// مرتجع الشراء (للمورد) لسه بيُدخل حر زي ما كان - مفيش ربط بفاتورة شراء في قاعدة البيانات حاليًا
type FreeLine = { productId: string; quantity: string; unitPrice: string };

export default function ReturnForm({ products, customers: initialCustomers, suppliers, reasons }: any) {
  const [customers, setCustomers] = useState(initialCustomers);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [kind, setKind] = useState<"SALE_RETURN" | "PURCHASE_RETURN">("SALE_RETURN");
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [reasonCategory, setReasonCategory] = useState(reasons[0]);
  const [reason, setReason] = useState("");
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [imageName, setImageName] = useState("");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<FreeLine[]>([{ productId: "", quantity: "", unitPrice: "" }]);

  // -------- مرتجع البيع: اختيار الفاتورة الأصلية ثم بنودها --------
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [saleLines, setSaleLines] = useState<SaleLine[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    setInvoiceId("");
    setSaleLines([]);
    if (kind !== "SALE_RETURN" || !customerId) { setCustomerInvoices([]); return; }
    setLoadingInvoices(true);
    listCustomerInvoicesForReturn(customerId)
      .then((rows) => setCustomerInvoices(Array.isArray(rows) ? rows : []))
      .finally(() => setLoadingInvoices(false));
  }, [kind, customerId]);

  useEffect(() => {
    if (!invoiceId) { setSaleLines([]); return; }
    setLoadingItems(true);
    getInvoiceItemsForReturn(invoiceId)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setSaleLines(
          list
            .filter((r: any) => r.returnableQty > 0)
            .map((r: any) => ({ invoiceItemId: r.id, productId: r.productId, productName: r.productName, unitPrice: Number(r.unitPrice), returnableQty: r.returnableQty, quantity: "" }))
        );
      })
      .finally(() => setLoadingItems(false));
  }, [invoiceId]);

  if (!open) return <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ تسجيل مرتجع</button>;

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageName(f.name);
    setImageUrl(await fileToDataUrl(f));
  }

  function submit() {
    setError("");
    if (kind === "SALE_RETURN") {
      if (!customerId) return setError("اختر العميل");
      if (!invoiceId) return setError("اختر الفاتورة الأصلية اللي البضاعة اترجعت منها");
      const items = saleLines.filter((l) => l.quantity && parseInt(l.quantity) > 0).map((l) => ({
        productId: l.productId,
        invoiceItemId: l.invoiceItemId,
        quantity: parseInt(l.quantity),
        unitPrice: l.unitPrice,
      }));
      if (items.length === 0) return setError("لازم تحدد كمية صنف واحد على الأقل من بنود الفاتورة");
      for (const l of saleLines) {
        if (l.quantity && parseInt(l.quantity) > l.returnableQty) {
          return setError(`الكمية المطلوب إرجاعها من "${l.productName}" أكبر من المتاح فعليًا (${l.returnableQty})`);
        }
      }
      start(async () => {
        try {
          const result = await createReturnRequest({ kind, invoiceId, customerId, reasonCategory, reason: reason || undefined, imageUrl, items });
          if (isActionError(result)) { setError(result.error); return; }
          setOpen(false); router.refresh();
        } catch (e: any) {
          setError(friendlyErrorMessage(e, "تعذر حفظ المرتجع"));
        }
      });
      return;
    }

    if (!supplierId) return setError("اختر المورد");
    const items = lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity), unitPrice: parseFloat(l.unitPrice) || 0 }));
    if (items.length === 0) return setError("لازم تضيف صنف واحد على الأقل");
    start(async () => {
      try {
        const result = await createReturnRequest({ kind, supplierId, reasonCategory, reason: reason || undefined, imageUrl, items });
        if (isActionError(result)) { setError(result.error); return; }
        setOpen(false); router.refresh();
      } catch (e: any) {
        setError(friendlyErrorMessage(e, "تعذر حفظ المرتجع"));
      }
    });
  }

  return (
    <div className="app-card p-4 space-y-3">
      <h2 className="font-bold">تسجيل مرتجع</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="border rounded px-3 py-2 text-sm">
          <option value="SALE_RETURN">مرتجع بيع (من عميل)</option>
          <option value="PURCHASE_RETURN">مرتجع شراء (لمورد)</option>
        </select>
        {kind === "SALE_RETURN" ? (
          <CustomerPicker
            customers={customers}
            value={customerId}
            onChange={(id) => setCustomerId(id)}
            onCreated={(c) => setCustomers((prev: any) => [...prev, c])}
            label=""
          />
        ) : (
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border rounded px-3 py-2 text-sm">
            <option value="">اختر المورد *</option>
            {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted">سبب المرتجع *</label>
          <select value={reasonCategory} onChange={(e) => setReasonCategory(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1">
            {reasons.map((r: string) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted">صورة (اختياري)</label>
          <input type="file" accept="image/*" onChange={onImage} className="border rounded px-2 py-1.5 text-xs w-full mt-1" />
          {imageName && <div className="text-xs text-muted mt-1">✓ {imageName}</div>}
        </div>
      </div>

      <div>
        <label className="text-xs text-muted">ملاحظات إضافية</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="border rounded px-3 py-2 text-sm w-full mt-1" rows={2} />
      </div>

      {kind === "SALE_RETURN" ? (
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide">الفاتورة الأصلية والأصناف</div>
          {!customerId && <div className="text-xs text-muted">اختر العميل الأول عشان تشوف فواتيره</div>}
          {customerId && loadingInvoices && <div className="text-xs text-muted">بيجيب فواتير العميل...</div>}
          {customerId && !loadingInvoices && customerInvoices.length === 0 && <div className="text-xs text-amber-700">العميل ده مفيش له فواتير بيع مسجلة</div>}
          {customerId && customerInvoices.length > 0 && (
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="border rounded px-3 py-2 text-sm w-full">
              <option value="">اختر الفاتورة *</option>
              {customerInvoices.map((inv: any) => (
                <option key={inv.id} value={inv.id}>{inv.code} - {money(inv.total)} - {dateAr(inv.createdAt)}</option>
              ))}
            </select>
          )}
          {invoiceId && loadingItems && <div className="text-xs text-muted">بيجيب بنود الفاتورة...</div>}
          {invoiceId && !loadingItems && saleLines.length === 0 && <div className="text-xs text-amber-700">كل بنود الفاتورة دي اترجعت بالكامل قبل كده - مفيش حاجة متاحة للإرجاع</div>}
          {invoiceId && saleLines.length > 0 && (
            <div className="space-y-2">
              {saleLines.map((l, idx) => (
                <div key={l.invoiceItemId} className="grid sm:grid-cols-3 gap-2 items-center text-sm">
                  <div>{l.productName} <span className="text-xs text-muted">(متاح للإرجاع: {l.returnableQty})</span></div>
                  <input
                    type="number"
                    min={0}
                    max={l.returnableQty}
                    placeholder="الكمية المرتجعة"
                    value={l.quantity}
                    onChange={(e) => { const next = [...saleLines]; next[idx].quantity = e.target.value; setSaleLines(next); }}
                    className="border rounded px-2 py-1.5 text-sm"
                  />
                  <div className="text-xs text-muted">سعر الوحدة: {money(l.unitPrice)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 border-t pt-3">
          <div className="text-xs font-semibold text-muted uppercase tracking-wide">الأصناف</div>
          {lines.map((line, idx) => (
            <div key={idx} className="grid sm:grid-cols-3 gap-2">
              <select value={line.productId} onChange={(e) => { const next = [...lines]; next[idx].productId = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm">
                <option value="">اختر منتج</option>
                {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => { const next = [...lines]; next[idx].quantity = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
              <input type="number" step="0.01" placeholder="السعر" value={line.unitPrice} onChange={(e) => { const next = [...lines]; next[idx].unitPrice = e.target.value; setLines(next); }} className="border rounded px-2 py-1.5 text-sm" />
            </div>
          ))}
          <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "", unitPrice: "" }])} className="text-sm text-gold">+ سطر</button>
        </div>
      )}

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="flex gap-2 border-t pt-3">
        <button disabled={pending} onClick={submit} className="bg-primary text-white rounded-lg px-5 py-2 text-sm">إرسال للاعتماد</button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
      </div>
    </div>
  );
}
