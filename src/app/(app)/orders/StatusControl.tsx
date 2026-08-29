"use client";
import { useTransition } from "react";
import { updateOrderStatus } from "@/actions/orders";
import { useRouter } from "next/navigation";

const LABELS: Record<string, string> = { PREPARING: "قيد التجهيز", SHIPPED: "في الشحن", DELIVERED: "تم التسليم", RETURNED: "مرتجع" };
const COLORS: Record<string, string> = { PREPARING: "bg-neutral-200", SHIPPED: "bg-blue-200", DELIVERED: "bg-green-200", RETURNED: "bg-red-200" };

export default function StatusControl({ orderId, status }: { orderId: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => start(async () => { await updateOrderStatus(orderId, e.target.value as any); router.refresh(); })}
      className={`text-xs rounded px-2 py-1 border-0 ${COLORS[status]}`}
    >
      {Object.entries(LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>
  );
}
