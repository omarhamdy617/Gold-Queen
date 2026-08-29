"use client";
import { useState, useTransition } from "react";
import { settleConsignment } from "@/actions/consignments";
import { useRouter } from "next/navigation";

export default function SettleForm({ consignmentId }: { consignmentId: string }) {
  const [amount, setAmount] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          await settleConsignment(consignmentId, parseFloat(amount) || 0);
          setAmount("");
          router.refresh();
        });
      }}
      className="flex gap-2"
    >
      <input type="number" step="0.01" placeholder="مبلغ التسوية" value={amount} onChange={(e) => setAmount(e.target.value)} className="border rounded px-2 py-1 text-sm flex-1" />
      <button disabled={pending} className="bg-neutral-800 text-white text-xs rounded px-3">تسوية</button>
    </form>
  );
}
