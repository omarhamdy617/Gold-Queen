"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OrderSearchBox({ initialQuery, status }: { initialQuery: string; status: string }) {
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();

  function buildUrl(query: string) {
    const params = new URLSearchParams();
    if (status && status !== "ALL") params.set("status", status);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    return qs ? `/orders?${qs}` : "/orders";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(buildUrl(q));
      }}
      className="flex gap-2"
    >
      <input
        placeholder="ابحث بكود الأوردر أو اسم/رقم العميل..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="border rounded-lg px-3 py-2 text-sm flex-1 max-w-md"
      />
      <button className="bg-navy text-white rounded-lg px-4 py-2 text-sm">بحث</button>
      {initialQuery && (
        <button type="button" onClick={() => { setQ(""); router.push(buildUrl("")); }} className="text-sm text-muted">
          مسح البحث
        </button>
      )}
    </form>
  );
}
