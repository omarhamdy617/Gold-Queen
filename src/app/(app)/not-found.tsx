import Link from "next/link";

export default function AppNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-5xl">🔍</div>
        <h1 className="text-lg font-bold text-foreground">الصفحة أو العنصر غير موجود</h1>
        <p className="text-sm text-muted">ممكن يكون اتمسح، أو اللينك اللي دخلت بيه غلط.</p>
        <Link href="/" className="inline-block bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-bold hover:bg-primary-dark">
          الرجوع للوحة التحكم
        </Link>
      </div>
    </div>
  );
}
