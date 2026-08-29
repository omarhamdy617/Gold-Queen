"use client";
import { useState, useTransition } from "react";
import { createPurchase, createSupplier } from "@/actions/purchases";
import { useRouter } from "next/navigation";

type Line = { productId: string; quantity: string; unitCost: string; serials: string };

export default function PurchaseForm({ suppliers, products, locations, paymentMethods }: any) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "UNPAID" | "PARTIAL">("UNPAID");
  const [paidAmount, setPaidAmount] = useState("0");
  const [paymentMethodId, setPaymentMethodId] = useState(paymentMethods[0]?.id || "");
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "", unitCost: "", serials: "" }]);
  const [newSupplierName, setNewSupplierName] = useState("");

  const total = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitCost) || 0), 0);

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="bg-gold text-white rounded-lg px-4 py-2 text-sm">
        + تسجيل شراء جديد
      </button>
    );

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="flex gap-1">
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1">
            <option value="">اختر المورد</option>
            {suppliers.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-1">
          <input placeholder="أو مورد جديد" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className="border rounded px-3 py-2 text-sm flex-1" />
          <button
            type="button"
            onClick={() =>
              start(async () => {
                if (!newSupplierName) return;
                const s = await createSupplier({ name: newSupplierName });
                setSupplierId(s.id);
                setNewSupplierName("");
                router.refresh();
              })
            }
            className="bg-neutral-800 text-white rounded px-3 text-sm"
          >
            إضافة
          </button>
        </div>
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border rounded px-3 py-2 text-sm">
          {locations.map((l: any) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {lines.map((line, idx) => {
          const product = products.find((p: any) => p.id === line.productId);
          return (
            <div key={idx} className="grid sm:grid-cols-5 gap-2 items-center">
              <select
                value={line.productId}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx].productId = e.target.value;
                  setLines(next);
                }}
                className="border rounded px-2 py-1.5 text-sm sm:col-span-2"
              >
                <option value="">اختر منتج</option>
                {products.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input type="number" placeholder="الكمية" value={line.quantity} onChange={(e) => {
                const next = [...lines]; next[idx].quantity = e.target.value; setLines(next);
              }} className="border rounded px-2 py-1.5 text-sm" />
              <input type="number" step="0.01" placeholder="سعر الوحدة" value={line.unitCost} onChange={(e) => {
                const next = [...lines]; next[idx].unitCost = e.target.value; setLines(next);
              }} className="border rounded px-2 py-1.5 text-sm" />
              {product?.requiresSerial ? (
                <input placeholder="السيريالات مفصولة بفاصلة" value={line.serials} onChange={(e) => {
                  const next = [...lines]; next[idx].serials = e.target.value; setLines(next);
                }} className="border rounded px-2 py-1.5 text-sm" />
              ) : (
                <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-red-500 text-xs">حذف السطر</button>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setLines([...lines, { productId: "", quantity: "", unitCost: "", serials: "" }])} className="text-sm text-gold">
          + إضافة سطر
        </button>
      </div>

      <div className="grid sm:grid-cols-4 gap-3 items-end border-t pt-3">
        <div className="text-sm">الإجمالي: <span className="font-bold">{total.toFixed(2)} ج.م</span></div>
        <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as any)} className="border rounded px-3 py-2 text-sm">
          <option value="UNPAID">آجل بالكامل</option>
          <option value="PARTIAL">دفع جزئي</option>
          <option value="PAID">مدفوع بالكامل</option>
        </select>
        {paymentStatus !== "UNPAID" && (
          <>
            <input type="number" step="0.01" placeholder="المبلغ المدفوع" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} className="border rounded px-3 py-2 text-sm" />
            <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} className="border rounded px-3 py-2 text-sm">
              {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <button
          disabled={pending || !supplierId || !locationId}
          onClick={() =>
            start(async () => {
              const paid = paymentStatus === "PAID" ? total : paymentStatus === "PARTIAL" ? parseFloat(paidAmount) || 0 : 0;
              await createPurchase({
                supplierId,
                locationId,
                items: lines
                  .filter((l) => l.productId && l.quantity)
                  .map((l) => ({
                    productId: l.productId,
                    quantity: parseInt(l.quantity),
                    unitCost: parseFloat(l.unitCost) || 0,
                    serials: l.serials ? l.serials.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
                  })),
                paymentStatus,
                paidAmount: paid,
                paymentMethodId: paid > 0 ? paymentMethodId : undefined,
              });
              setOpen(false);
              setLines([{ productId: "", quantity: "", unitCost: "", serials: "" }]);
              router.refresh();
            })
          }
          className="bg-gold text-white rounded-lg px-5 py-2 text-sm"
        >
          حفظ الشراء
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-neutral-500 text-sm">إلغاء</button>
      </div>
    </div>
  );
}
