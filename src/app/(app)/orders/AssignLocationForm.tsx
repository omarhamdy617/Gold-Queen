"use client";
import { useState, useTransition } from "react";
import { assignOrderLocation } from "@/actions/orders";
import { useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/errors";

export default function AssignLocationForm({ orderId, locations }: { orderId: string; locations: any[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [error, setError] = useState("");

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="border rounded text-xs px-1 py-1">
          {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError("");
              try {
                await assignOrderLocation(orderId, locationId);
                router.refresh();
              } catch (e: any) {
                setError(friendlyErrorMessage(e, "تعذر تحديد المكان"));
              }
            })
          }
          className="bg-navy text-white text-xs rounded px-2 py-1"
        >
          تحديد المكان
        </button>
      </div>
      {error && <span className="text-red-600 text-[10px]">{error}</span>}
    </div>
  );
}
