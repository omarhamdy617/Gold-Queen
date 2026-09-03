"use client";
import { useState, useTransition } from "react";
import { createReturnRequest } from "@/actions/returns";
import { useRouter } from "next/navigation";
import CustomerPicker from "@/components/CustomerPicker";
import { friendlyErrorMessage } from "@/lib/errors";
import { isActionError } from "@/lib/actionError";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
  const [lines, setLines] = useState([{ productId: "", quantity: "", unitPrice: "" }]);

  if (!open) return <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">+ تسجيل مرتجع</button>;

  async function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageName(f.name);
    setImageUrl(await fileToDataUrl(f));
  }

  function submit() {
    setError("");
    if (kind === "SALE_RETURN" && !customerId) return setError("اختر العميل");
    if (kind === "PURCHASE_RETURN" && !supplierId) return setError("اختر المورد");
    const items = lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: parseInt(l.quantity), unitPrice: parseFloat(l.unitPrice) || 0 }));
    if (items.length === 0) return setError("لازم تضيف صنف واحد على الأقل");
    start(async () => {
      try {
        const result = await createReturnRequest({
          kind,
          customerId: kind === "SALE_RETURN" ? (customerId || undefined) : undefined,
          supplierId: kind === "PURCHASE_RETURN" ? (supplierId || undefined) : undefined,
          reasonCategory,
          reason: reason || undefined,
          imageUrl,
          items,
        });
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

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="flex gap-2 border-t pt-3">
        <button disabled={pending} onClick={submit} className="bg-primary text-white rounded-lg px-5 py-2 text-sm">إرسال للاعتماد</button>
        <button type="button" onClick={() => setOpen(false)} className="text-muted text-sm">إلغاء</button>
      </div>
    </div>
  );
}
