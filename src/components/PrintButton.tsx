"use client";
export default function PrintButton({ label = "طباعة" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="bg-neutral-800 text-white rounded-lg px-4 py-2 text-sm">
      {label}
    </button>
  );
}
