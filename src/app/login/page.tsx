"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "حدث خطأ");
        setLoading(false);
        return;
      }
      router.push(params.get("next") || "/");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالسيرفر");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary-light to-primary flex items-center justify-center text-xl font-bold text-white shadow-lg">
            GQ
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">جولد كوين</h1>
          <p className="text-neutral-400 text-sm mt-1">نظام المبيعات والمخازن والحسابات</p>
        </div>
        <form onSubmit={onSubmit} className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">اسم المستخدم</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="مثال: omar"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">كلمة المرور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          <button
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark transition text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
          >
            {loading ? "جارٍ الدخول..." : "دخول"}
          </button>
        </form>
      </div>
    </div>
  );
}
