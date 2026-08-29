"use client";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

export default function PeriodPicker({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [range, setRange] = useState("3m");

  function applyPreset(preset: string) {
    setRange(preset);
    const to = new Date();
    const from = new Date();
    if (preset === "3m") from.setMonth(from.getMonth() - 3);
    if (preset === "6m") from.setMonth(from.getMonth() - 6);
    if (preset === "1y") from.setFullYear(from.getFullYear() - 1);
    router.push(`${pathname}?from=${from.toISOString()}&to=${to.toISOString()}`);
  }

  return (
    <select value={range} onChange={(e) => applyPreset(e.target.value)} className="border rounded px-2 py-1.5 text-xs">
      <option value="3m">آخر 3 شهور</option>
      <option value="6m">آخر 6 شهور</option>
      <option value="1y">آخر سنة</option>
    </select>
  );
}
