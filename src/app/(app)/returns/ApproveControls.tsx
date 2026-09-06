"use client";
import { useState, useTransition } from "react";
import { approveReturn, rejectReturn } from "@/actions/returns";
import { useRouter } from "next/navigation";
import { isActionError } from "@/lib/actionError";

export default function ApproveControls({ id, locations, paymentMethods }: { id: string; locations: any[]; paymentMethods: any[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [pmId, setPmId] = useState(paymentMethods[0]?.id || "");
  const [error, setError] = useState("");

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border rounded text-xs px-1 py-1">
          {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={pmId} onChange={(e) => setPmId(e.target.value)} className="border rounded text-xs px-1 py-1">
          {paymentMethods.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button
          disabled={pending}
          onClick={() => {
            setError("");
            start(async () => {
              const r = await approveReturn(id, locationId, pmId);
              if (isActionError(r)) { setError(r.error); return; }
              router.refresh();
            });
          }}
          className="bg-green-600 text-white text-xs rounded px-2 py-1"
        >
          اعتماد
        </button>
        <button
          disabled={pending}
          onClick={() => {
            setError("");
            start(async () => {
              const r = await rejectReturn(id);
              if (isActionError(r)) { setError(r.error); return; }
              router.refresh();
            });
          }}
          className="bg-red-600 text-white text-xs rounded px-2 py-1"
        >
          رفض
        </button>
      </div>
      {error && <div className="text-red-600 text-[11px]">{error}</div>}
    </div>
  );
}
