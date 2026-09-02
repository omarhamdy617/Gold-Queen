"use client";
import { useEffect } from "react";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-5xl">⚠️</div>
        <h1 className="text-lg font-bold text-foreground">حصلت مشكلة أثناء تنفيذ العملية</h1>
        <p className="text-sm text-muted">
          {error.message && !error.message.toLowerCase().includes("server components render")
            ? error.message
            : "حصل خطأ غير متوقع من السيرفر. جرب تاني، ولو المشكلة استمرت ابعت لنا تفاصيل العملية اللي كنت بتعملها."}
        </p>
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => reset()} className="bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-bold hover:bg-primary-dark">
            حاول تاني
          </button>
          <a href="/" className="border border-border rounded-lg px-5 py-2.5 text-sm hover:bg-neutral-50">
            الرجوع للوحة التحكم
          </a>
        </div>
        {error.digest && <p className="text-[10px] text-neutral-400">كود المرجع: {error.digest}</p>}
      </div>
    </div>
  );
}
