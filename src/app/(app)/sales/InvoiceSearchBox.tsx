"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// كانت شاشة الفواتير من غير أي مربّع بحث خالص - listInvoices نفسها كانت عندها باراميتر بحث
// معرّف بس متستخدمش، وده كان بيرجّع دايمًا آخر 300 فاتورة من غير أي فلترة
export default function InvoiceSearchBox({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/sales?q=${encodeURIComponent(q.trim())}` : "/sales");
      }}
      className="flex gap-2"
    >
      <input
        placeholder="ابحث بكود الفاتورة أو اسم/رقم العميل..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-md"
      />
      <button className="bg-navy text-white rounded-lg px-4 py-2 text-sm">بحث</button>
      {initialQuery && (
        <button type="button" onClick={() => { setQ(""); router.push("/sales"); }} className="text-sm text-muted">
          مسح البحث
        </button>
      )}
    </form>
  );
}
